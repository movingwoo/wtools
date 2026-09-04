import { createZip, extractZip } from '../lib/archive/zip.js';

self.onmessage = ({ data: { action, bytes, entries, level, limits } }) => {
  try {
    const onProgress = (progress) => self.postMessage({ type: 'progress', progress });
    if (action === 'create') {
      const output = createZip(entries, { level, limits, onProgress });
      self.postMessage({ type: 'result', output }, [output.buffer]);
      return;
    }
    if (action === 'extract') {
      const outputEntries = extractZip(bytes, { limits, onProgress });
      self.postMessage({ type: 'result', entries: outputEntries }, outputEntries.map((entry) => entry.data.buffer));
      return;
    }
    throw new Error('지원하지 않는 ZIP 작업입니다.');
  } catch (error) {
    self.postMessage({ type: 'result', error: error?.message || String(error) });
  }
};
