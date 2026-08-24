// DOM-independent text diff using a bidirectional Myers search.

function appendChange(changes, kind, tokens) {
  if (!tokens.length) return;
  const added = kind === 'added' || undefined;
  const removed = kind === 'removed' || undefined;
  const last = changes[changes.length - 1];
  if (last && last.added === added && last.removed === removed) {
    for (const token of tokens) last.value.push(token);
    last.count += tokens.length;
    return;
  }
  changes.push({ value: [...tokens], count: tokens.length, added, removed });
}

function middleSplit(oldTokens, newTokens, oldStart, oldEnd, newStart, newEnd, equals) {
  const oldLength = oldEnd - oldStart;
  const newLength = newEnd - newStart;
  const maxDepth = Math.ceil((oldLength + newLength) / 2);
  const offset = maxDepth;
  const size = maxDepth * 2 + 1;
  const forward = new Int32Array(size);
  const reverse = new Int32Array(size);
  forward.fill(-1);
  reverse.fill(-1);
  forward[offset + 1] = 0;
  reverse[offset + 1] = 0;

  const delta = oldLength - newLength;
  const meetOnForward = delta % 2 !== 0;
  let forwardStart = 0;
  let forwardEnd = 0;
  let reverseStart = 0;
  let reverseEnd = 0;

  for (let depth = 0; depth <= maxDepth; depth++) {
    for (let diagonal = -depth + forwardStart; diagonal <= depth - forwardEnd; diagonal += 2) {
      const index = offset + diagonal;
      let x = diagonal === -depth
        || (diagonal !== depth && forward[index - 1] < forward[index + 1])
        ? forward[index + 1] : forward[index - 1] + 1;
      let y = x - diagonal;
      while (x < oldLength && y < newLength
        && equals(oldTokens[oldStart + x], newTokens[newStart + y])) {
        x++;
        y++;
      }
      forward[index] = x;
      if (x > oldLength) forwardEnd += 2;
      else if (y > newLength) forwardStart += 2;
      else if (meetOnForward) {
        const reverseIndex = offset + delta - diagonal;
        if (reverseIndex >= 0 && reverseIndex < size && reverse[reverseIndex] !== -1
          && x >= oldLength - reverse[reverseIndex]) {
          return [oldStart + x, newStart + y];
        }
      }
    }

    for (let diagonal = -depth + reverseStart; diagonal <= depth - reverseEnd; diagonal += 2) {
      const index = offset + diagonal;
      let x = diagonal === -depth
        || (diagonal !== depth && reverse[index - 1] < reverse[index + 1])
        ? reverse[index + 1] : reverse[index - 1] + 1;
      let y = x - diagonal;
      while (x < oldLength && y < newLength
        && equals(oldTokens[oldEnd - x - 1], newTokens[newEnd - y - 1])) {
        x++;
        y++;
      }
      reverse[index] = x;
      if (x > oldLength) reverseEnd += 2;
      else if (y > newLength) reverseStart += 2;
      else if (!meetOnForward) {
        const forwardDiagonal = delta - diagonal;
        const forwardIndex = offset + forwardDiagonal;
        if (forwardIndex >= 0 && forwardIndex < size && forward[forwardIndex] !== -1
          && forward[forwardIndex] >= oldLength - x) {
          const splitX = forward[forwardIndex];
          return [oldStart + splitX, newStart + splitX - forwardDiagonal];
        }
      }
    }
  }
  return null;
}

function diffRange(oldTokens, newTokens, oldStart, oldEnd, newStart, newEnd, equals, changes) {
  let prefix = 0;
  while (oldStart + prefix < oldEnd && newStart + prefix < newEnd
    && equals(oldTokens[oldStart + prefix], newTokens[newStart + prefix])) prefix++;
  appendChange(changes, 'equal', newTokens.slice(newStart, newStart + prefix));
  oldStart += prefix;
  newStart += prefix;

  let suffix = 0;
  while (oldStart < oldEnd - suffix && newStart < newEnd - suffix
    && equals(oldTokens[oldEnd - suffix - 1], newTokens[newEnd - suffix - 1])) suffix++;
  const coreOldEnd = oldEnd - suffix;
  const coreNewEnd = newEnd - suffix;

  if (oldStart === coreOldEnd) {
    appendChange(changes, 'added', newTokens.slice(newStart, coreNewEnd));
  } else if (newStart === coreNewEnd) {
    appendChange(changes, 'removed', oldTokens.slice(oldStart, coreOldEnd));
  } else if (coreOldEnd - oldStart === 1) {
    let match = -1;
    for (let i = newStart; i < coreNewEnd; i++) {
      if (equals(oldTokens[oldStart], newTokens[i])) {
        match = i;
        break;
      }
    }
    if (match < 0) {
      appendChange(changes, 'removed', oldTokens.slice(oldStart, coreOldEnd));
      appendChange(changes, 'added', newTokens.slice(newStart, coreNewEnd));
    } else {
      appendChange(changes, 'added', newTokens.slice(newStart, match));
      appendChange(changes, 'equal', newTokens.slice(match, match + 1));
      appendChange(changes, 'added', newTokens.slice(match + 1, coreNewEnd));
    }
  } else if (coreNewEnd - newStart === 1) {
    let match = -1;
    for (let i = oldStart; i < coreOldEnd; i++) {
      if (equals(oldTokens[i], newTokens[newStart])) {
        match = i;
        break;
      }
    }
    if (match < 0) {
      appendChange(changes, 'removed', oldTokens.slice(oldStart, coreOldEnd));
      appendChange(changes, 'added', newTokens.slice(newStart, coreNewEnd));
    } else {
      appendChange(changes, 'removed', oldTokens.slice(oldStart, match));
      appendChange(changes, 'equal', newTokens.slice(newStart, newStart + 1));
      appendChange(changes, 'removed', oldTokens.slice(match + 1, coreOldEnd));
    }
  } else {
    const split = middleSplit(
      oldTokens, newTokens, oldStart, coreOldEnd, newStart, coreNewEnd, equals,
    );
    if (!split || (split[0] === oldStart && split[1] === newStart)
      || (split[0] === coreOldEnd && split[1] === coreNewEnd)) {
      appendChange(changes, 'removed', oldTokens.slice(oldStart, coreOldEnd));
      appendChange(changes, 'added', newTokens.slice(newStart, coreNewEnd));
    } else {
      diffRange(oldTokens, newTokens, oldStart, split[0], newStart, split[1], equals, changes);
      diffRange(oldTokens, newTokens, split[0], coreOldEnd, split[1], coreNewEnd, equals, changes);
    }
  }
  appendChange(changes, 'equal', newTokens.slice(coreNewEnd, newEnd));
}

function orderReplacements(changes) {
  const ordered = [];
  for (let i = 0; i < changes.length;) {
    if (!changes[i].added && !changes[i].removed) {
      appendChange(ordered, 'equal', changes[i].value);
      i++;
      continue;
    }
    const removed = [];
    const added = [];
    while (i < changes.length && (changes[i].added || changes[i].removed)) {
      const target = changes[i].removed ? removed : added;
      for (const token of changes[i].value) target.push(token);
      i++;
    }
    appendChange(ordered, 'removed', removed);
    appendChange(ordered, 'added', added);
  }
  return ordered;
}

export function diffArrays(oldTokens, newTokens, equals = (a, b) => a === b) {
  if (!Array.isArray(oldTokens) || !Array.isArray(newTokens) || typeof equals !== 'function') {
    throw new TypeError('diffArrays에는 두 배열과 비교 함수를 전달해야 합니다.');
  }
  if (!oldTokens.length && !newTokens.length) return [{ value: [], count: 0 }];
  const changes = [];
  diffRange(oldTokens, newTokens, 0, oldTokens.length, 0, newTokens.length, equals, changes);
  return orderReplacements(changes);
}

function wordTokens(text) {
  const tokens = text.split(/([^\S\r\n]+|[()[\]{}'"\r\n]|\b)/);
  const letters = /^[A-Za-z\xC0-\u02C6\u02C8-\u02D7\u02DE-\u02FF\u1E00-\u1EFF]+$/;
  for (let i = 0; i < tokens.length - 1; i++) {
    if (!tokens[i + 1] && tokens[i + 2] && letters.test(tokens[i]) && letters.test(tokens[i + 2])) {
      tokens[i] += tokens[i + 2];
      tokens.splice(i + 1, 2);
      i--;
    }
  }
  return tokens.filter(Boolean);
}

function lineTokens(text, ignoreWhitespace) {
  const result = [];
  const tokens = text.split(/(\n|\r\n)/);
  if (!tokens[tokens.length - 1]) tokens.pop();
  for (let i = 0; i < tokens.length; i++) {
    let token = tokens[i];
    if (i % 2) result[result.length - 1] += token;
    else {
      if (ignoreWhitespace) token = token.trim();
      result.push(token);
    }
  }
  return result.filter(Boolean);
}

function joinChanges(changes) {
  return changes.map((change) => ({ ...change, value: change.value.join('') }));
}

export function diffChars(oldText, newText) {
  return joinChanges(diffArrays(oldText.split(''), newText.split('')));
}

export function diffWords(oldText, newText) {
  const whitespace = /^\s+$/;
  return joinChanges(diffArrays(
    wordTokens(oldText), wordTokens(newText),
    (a, b) => a === b || (whitespace.test(a) && whitespace.test(b)),
  ));
}

export function diffLines(oldText, newText, { ignoreWhitespace = false } = {}) {
  return joinChanges(diffArrays(
    lineTokens(oldText, ignoreWhitespace), lineTokens(newText, ignoreWhitespace),
  ));
}

function lineRecord(token) {
  const match = token.match(/(\r\n|\n)$/);
  const delimiter = match ? match[0] : '';
  return { text: delimiter ? token.slice(0, -delimiter.length) : token, delimiter };
}

function patchOperations(oldText, newText, ignoreWhitespace) {
  const changes = diffLines(oldText, newText, { ignoreWhitespace });
  const operations = [];
  for (const change of changes) {
    const tokens = lineTokens(change.value, false);
    const kind = change.added ? '+' : change.removed ? '-' : ' ';
    for (const token of tokens) operations.push({ kind, ...lineRecord(token) });
  }
  return operations;
}

function hunkRanges(operations, context) {
  const ranges = [];
  let searchFrom = 0;
  while (searchFrom < operations.length) {
    let firstChange = searchFrom;
    while (firstChange < operations.length && operations[firstChange].kind === ' ') firstChange++;
    if (firstChange === operations.length) break;
    let start = firstChange;
    let before = 0;
    while (start > 0 && operations[start - 1].kind === ' ' && before < context) {
      start--;
      before++;
    }

    let lastChange = firstChange;
    let cursor = firstChange + 1;
    while (cursor < operations.length) {
      if (operations[cursor].kind !== ' ') {
        lastChange = cursor++;
        continue;
      }
      let equalEnd = cursor;
      while (equalEnd < operations.length && operations[equalEnd].kind === ' ') equalEnd++;
      if (equalEnd < operations.length && equalEnd - cursor <= context * 2) {
        lastChange = equalEnd;
        cursor = equalEnd + 1;
        continue;
      }
      break;
    }
    let end = lastChange + 1;
    let after = 0;
    while (end < operations.length && operations[end].kind === ' ' && after < context) {
      end++;
      after++;
    }
    ranges.push([start, end]);
    searchFrom = end;
  }
  return ranges;
}

function lineCount(operations, end, side) {
  let count = 0;
  for (let i = 0; i < end; i++) {
    if (side === 'old' ? operations[i].kind !== '+' : operations[i].kind !== '-') count++;
  }
  return count;
}

export function createUnifiedPatch(
  oldFileName, newFileName, oldText, newText,
  { oldHeader = '', newHeader = '', context = 3, ignoreWhitespace = false } = {},
) {
  const safeContext = Number.isInteger(context) && context >= 0 ? context : 3;
  const operations = patchOperations(oldText, newText, ignoreWhitespace);
  let patch = '===================================================================\n'
    + `--- ${oldFileName}\t${oldHeader}\n+++ ${newFileName}\t${newHeader}\n`;

  for (const [start, end] of hunkRanges(operations, safeContext)) {
    const oldBefore = lineCount(operations, start, 'old');
    const newBefore = lineCount(operations, start, 'new');
    const oldLines = lineCount(operations.slice(start, end), end - start, 'old');
    const newLines = lineCount(operations.slice(start, end), end - start, 'new');
    const oldStart = oldLines ? oldBefore + 1 : oldBefore;
    const newStart = newLines ? newBefore + 1 : newBefore;
    patch += `@@ -${oldStart},${oldLines} +${newStart},${newLines} @@\n`;
    for (let i = start; i < end; i++) {
      const operation = operations[i];
      patch += operation.kind + operation.text + (operation.delimiter || '\n');
      if (!operation.delimiter) patch += '\\ No newline at end of file\n';
    }
  }
  return patch;
}
