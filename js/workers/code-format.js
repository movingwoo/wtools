import {
  formatJavaScript, minifyJavaScript, formatCss, minifyCss, formatHtml, minifyHtml,
} from '../lib/code/formatter.js';

const formatters = {
  js: { fmt: formatJavaScript, min: minifyJavaScript },
  css: { fmt: formatCss, min: minifyCss },
  html: { fmt: formatHtml, min: minifyHtml },
};

self.addEventListener('message', ({ data }) => {
  try {
    if (typeof data?.text !== 'string' || data.text.length > 4 * 1024 * 1024)
      throw new Error('Formatter input exceeds 4,194,304 characters');
    const formatter = formatters[data.lang]?.[data.action];
    if (!formatter) throw new Error('Unsupported formatter operation');
    const result = formatter(data.text, { indentSize: data.indentSize });
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error?.message || String(error), code: error?.code });
  }
}, { once: true });
