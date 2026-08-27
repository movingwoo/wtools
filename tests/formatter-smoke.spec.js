import { test, expect } from './helpers.js';
import {
  formatJavaScript, minifyJavaScript,
} from '../js/lib/code/formatter.js';

test('자체 코드 포매터가 브라우저별 의미와 공백을 보존한다', async ({ page }) => {
  const javascript = "let hit=false;if(true) /a/.test('a')&&(hit=true);globalThis.result=[77 .toExponential(),hit]";
  const javascriptCandidates = [javascript, formatJavaScript(javascript), minifyJavaScript(javascript)];
  const modulePaths = javascriptCandidates.map((_, index) => `/__formatter-check-${index}.js`);
  for (let index = 0; index < modulePaths.length; index++) {
    await page.route(`**${modulePaths[index]}`, (route) => route.fulfill({
      contentType: 'application/javascript',
      body: javascriptCandidates[index],
    }));
  }
  await page.goto('/');
  const result = await page.evaluate(async (paths) => {
    const formatter = await import('/js/lib/code/formatter.js');
    const execute = (path) => new Promise((resolve, reject) => {
      globalThis.result = undefined;
      const script = document.createElement('script');
      script.type = 'module';
      script.src = path;
      script.addEventListener('load', () => {
        script.remove();
        resolve(globalThis.result);
      }, { once: true });
      script.addEventListener('error', () => reject(new Error(`${path} 모듈 실행 실패`)), { once: true });
      document.head.append(script);
    });
    const js = [];
    for (const path of paths) {
      js.push(await execute(path));
    }

    const css = '.a :hover{width:calc(1px + 2px)}';
    const cssCandidates = [css, formatter.formatCss(css), formatter.minifyCss(css)];
    const cssRules = cssCandidates.map((value) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(value);
      return [...sheet.cssRules].map((rule) => rule.cssText);
    });

    const html = '<p>a<span> b </span>c</p>';
    const htmlCandidates = [html, formatter.formatHtml(html), formatter.minifyHtml(html)];
    const htmlText = htmlCandidates.map((value) => {
      const host = document.createElement('div');
      host.innerHTML = value;
      return host.textContent;
    });

    return {
      js,
      css: cssRules,
      html: htmlText,
      dataScript: formatter.formatHtml('<script type="text/x-template">{{ user  name }}</script>'),
    };
  }, modulePaths);

  expect(result.js.slice(1)).toEqual([result.js[0], result.js[0]]);
  expect(result.css.slice(1)).toEqual([result.css[0], result.css[0]]);
  expect(result.html.slice(1)).toEqual([result.html[0], result.html[0]]);
  expect(result.dataScript).toBe('<script type="text/x-template">{{ user  name }}</script>');
});
