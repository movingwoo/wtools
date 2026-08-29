self.addEventListener('message', async ({ data }) => {
  try {
    if (typeof data?.text !== 'string' || data.text.length > 4 * 1024 * 1024)
      throw new Error('Formatter input exceeds 4,194,304 characters');
    let formatter;
    if (data.lang === 'yaml') {
      const yaml = await import('../lib/data/yaml.js');
      formatter = (text, options) => yaml.dump(yaml.load(text), data.action === 'min'
        ? { flowLevel: 0 } : { indent: options.indentSize, lineWidth: 120 });
    } else if (data.lang === 'sql') {
      const sql = await import('../lib/code/sql-formatter.js');
      formatter = data.action === 'fmt' ? sql.formatSql : data.action === 'min' ? sql.minifySql : null;
    } else {
      const code = await import('../lib/code/formatter.js');
      const formatters = {
        js: { fmt: code.formatJavaScript, min: code.minifyJavaScript },
        css: { fmt: code.formatCss, min: code.minifyCss },
        html: { fmt: code.formatHtml, min: code.minifyHtml },
      };
      formatter = formatters[data.lang]?.[data.action];
    }
    if (!formatter) throw new Error('Unsupported formatter operation');
    const result = formatter(data.text, { indentSize: data.indentSize, ...data.formatterOptions });
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error?.message || String(error), code: error?.code });
  }
}, { once: true });
