import { parseMarkdown } from '../lib/markdown/parser.js';

self.addEventListener('message', ({ data }) => {
  try {
    self.postMessage({ html: parseMarkdown(data.text) });
  } catch (error) {
    self.postMessage({
      error: error?.message || String(error),
      code: error?.code || null,
    });
  }
});
