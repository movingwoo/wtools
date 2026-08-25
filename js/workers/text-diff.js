import {
  createUnifiedPatchFromChanges, diffChars, diffLines, diffWords,
} from '../lib/diff/myers.js';

self.addEventListener('message', ({ data }) => {
  try {
    const { oldText, newText, mode, ignoreWhitespace } = data;
    const displayOld = ignoreWhitespace && mode === 'chars' ? oldText.replace(/\s+/g, '') : oldText;
    const displayNew = ignoreWhitespace && mode === 'chars' ? newText.replace(/\s+/g, '') : newText;
    const lineChanges = diffLines(oldText, newText, { ignoreWhitespace });
    const parts = mode === 'lines' ? lineChanges
      : mode === 'words' ? diffWords(displayOld, displayNew)
        : diffChars(displayOld, displayNew);
    const patch = createUnifiedPatchFromChanges(
      '텍스트 A.txt', '텍스트 B.txt', lineChanges, { context: 3 },
    );
    self.postMessage({ parts, patch });
  } catch (error) {
    self.postMessage({ error: error?.message || String(error) });
  }
});
