// DOM-independent FIGfont parser and renderer for printable ASCII text.

const FULL_WIDTH = 0;
const FITTING = 1;
const UNIVERSAL_SMUSHING = 2;
const CONTROLLED_SMUSHING = 3;

function finiteInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`Invalid FIGfont ${name}.`);
  return parsed;
}

function layoutRules(oldLayout, fullLayout) {
  const value = fullLayout ?? oldLayout;
  const rules = {
    hRule1: (value & 1) !== 0,
    hRule2: (value & 2) !== 0,
    hRule3: (value & 4) !== 0,
    hRule4: (value & 8) !== 0,
    hRule5: (value & 16) !== 0,
    hRule6: (value & 32) !== 0,
    vRule1: (value & 256) !== 0,
    vRule2: (value & 512) !== 0,
    vRule3: (value & 1024) !== 0,
    vRule4: (value & 2048) !== 0,
    vRule5: (value & 4096) !== 0,
  };
  const hasHorizontalRule = Object.keys(rules).some((key) => key.startsWith('h') && rules[key]);
  const hasVerticalRule = Object.keys(rules).some((key) => key.startsWith('v') && rules[key]);

  if ((value & 128) !== 0) {
    rules.hLayout = hasHorizontalRule ? CONTROLLED_SMUSHING : UNIVERSAL_SMUSHING;
  } else if ((value & 64) !== 0) rules.hLayout = FITTING;
  else if (fullLayout == null) {
    rules.hLayout = oldLayout === -1 ? FULL_WIDTH
      : oldLayout === 0 ? FITTING
        : hasHorizontalRule ? CONTROLLED_SMUSHING : UNIVERSAL_SMUSHING;
  } else rules.hLayout = FULL_WIDTH;

  if ((value & 16384) !== 0) {
    rules.vLayout = hasVerticalRule ? CONTROLLED_SMUSHING : UNIVERSAL_SMUSHING;
  } else if ((value & 8192) !== 0) rules.vLayout = FITTING;
  else rules.vLayout = hasVerticalRule ? CONTROLLED_SMUSHING : FULL_WIDTH;
  return rules;
}

export function parseFigFont(source) {
  if (typeof source !== 'string') throw new TypeError('FIGfont source must be a string.');
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const header = (lines.shift() || '').split(/\s+/);
  if (!/^flf2a.$/.test(header[0] || '') || header.length < 6) {
    throw new Error('Invalid FIGfont header.');
  }
  const hardBlank = header[0].slice(5);
  const height = finiteInteger(header[1], 'height');
  const baseline = finiteInteger(header[2], 'baseline');
  const maxLength = finiteInteger(header[3], 'maximum length');
  const oldLayout = finiteInteger(header[4], 'layout');
  const commentLines = finiteInteger(header[5], 'comment count');
  const printDirection = header[6] == null ? 0 : finiteInteger(header[6], 'print direction');
  const fullLayout = header[7] == null ? null : finiteInteger(header[7], 'full layout');
  if (height < 1 || height > 64 || baseline < 0 || maxLength < 0 || commentLines < 0
    || ![0, 1].includes(printDirection)) throw new Error('Invalid FIGfont header values.');
  if (lines.length < commentLines + height * 95) throw new Error('FIGfont is missing ASCII glyph data.');
  const comment = lines.splice(0, commentLines).join('\n');
  const glyphs = new Map();
  for (let code = 32; code <= 126; code++) {
    const rows = lines.splice(0, height).map((line) => {
      if (!line) return '';
      const endMark = line[line.length - 1];
      let end = line.length;
      while (end > 0 && line[end - 1] === endMark) end--;
      return line.slice(0, end);
    });
    glyphs.set(code, rows);
  }
  return {
    hardBlank, height, baseline, maxLength, printDirection, comment, glyphs,
    rules: layoutRules(oldLayout, fullLayout),
  };
}

function hierarchySmush(left, right) {
  const classes = ['|', '/\\', '[]', '{}', '()', '<>'];
  const leftClass = classes.findIndex((chars) => chars.includes(left));
  const rightClass = classes.findIndex((chars) => chars.includes(right));
  if (leftClass >= 0 && rightClass >= 0 && leftClass !== rightClass) {
    return leftClass > rightClass ? left : right;
  }
  return '';
}

function underscoreSmush(left, right) {
  const replaces = '|/\\[]{}()<>';
  if (left === '_' && replaces.includes(right)) return right;
  if (right === '_' && replaces.includes(left)) return left;
  return '';
}

function horizontalControlledSmush(left, right, font) {
  const { rules, hardBlank } = font;
  if (rules.hRule1 && left === right && left !== hardBlank) return left;
  if (rules.hRule2) {
    const result = underscoreSmush(left, right);
    if (result) return result;
  }
  if (rules.hRule3) {
    const result = hierarchySmush(left, right);
    if (result) return result;
  }
  if (rules.hRule4 && ('[] {} ()'.includes(left + right) || '[] {} ()'.includes(right + left))) {
    const pairs = new Set(['[]', '][', '{}', '}{', '()', ')(']);
    if (pairs.has(left + right)) return '|';
  }
  if (rules.hRule5) {
    if (left + right === '/\\') return '|';
    if (left + right === '\\/') return 'Y';
    if (left + right === '><') return 'X';
  }
  if (rules.hRule6 && left === hardBlank && right === hardBlank) return hardBlank;
  return '';
}

function universalSmush(left, right, hardBlank) {
  if (!right || right === ' ') return left;
  if (right === hardBlank && left !== ' ') return left;
  return right;
}

function horizontalOverlap(left, right, font) {
  if (font.rules.hLayout === FULL_WIDTH || !left.length) return 0;
  for (let distance = 1; distance <= left.length; distance++) {
    let stop = false;
    const overlap = Math.min(distance, right.length);
    for (let i = 0; i < overlap; i++) {
      const leftChar = left[left.length - distance + i] || '';
      const rightChar = right[i] || '';
      if (leftChar === ' ' || rightChar === ' ' || !leftChar || !rightChar) continue;
      if (font.rules.hLayout === FITTING) return distance - 1;
      if (font.rules.hLayout === UNIVERSAL_SMUSHING) {
        return leftChar === font.hardBlank || rightChar === font.hardBlank ? distance - 1 : distance;
      }
      if (!horizontalControlledSmush(leftChar, rightChar, font)) return distance - 1;
      stop = true;
    }
    if (stop) return distance;
  }
  return left.length;
}

function mergeRows(leftRows, rightRows, overlap, font) {
  return leftRows.map((left, row) => {
    const right = rightRows[row];
    const split = Math.max(0, left.length - overlap);
    let middle = '';
    const leftPart = left.slice(Math.max(0, left.length - overlap));
    const rightPart = right.slice(0, overlap);
    for (let i = 0; i < overlap; i++) {
      const leftChar = leftPart[i] || ' ';
      const rightChar = rightPart[i] || ' ';
      if (leftChar !== ' ' && rightChar !== ' ' && font.rules.hLayout === CONTROLLED_SMUSHING) {
        middle += horizontalControlledSmush(leftChar, rightChar, font)
          || universalSmush(leftChar, rightChar, font.hardBlank);
      } else middle += universalSmush(leftChar, rightChar, font.hardBlank);
    }
    return left.slice(0, split) + middle + right.slice(overlap);
  });
}

function renderLine(text, font) {
  let output = Array(font.height).fill('');
  const chars = [...text];
  if (font.printDirection === 1) chars.reverse();
  for (const char of chars) {
    const glyph = font.glyphs.get(char.codePointAt(0));
    if (!glyph) throw new Error(`Unsupported FIGfont character: U+${char.codePointAt(0).toString(16).toUpperCase()}`);
    let overlap = font.rules.hLayout === FULL_WIDTH ? 0 : Number.POSITIVE_INFINITY;
    for (let row = 0; row < font.height; row++) {
      overlap = Math.min(overlap, horizontalOverlap(output[row], glyph[row], font));
    }
    output = mergeRows(output, glyph, Number.isFinite(overlap) ? overlap : 0, font);
  }
  return output.map((row) => row.split(font.hardBlank).join(' '));
}

function verticalControlledSmush(top, bottom, rules) {
  if (rules.vRule5 && top === '|' && bottom === '|') return '|';
  if (rules.vRule1 && top === bottom) return top;
  if (rules.vRule2) {
    const result = underscoreSmush(top, bottom);
    if (result) return result;
  }
  if (rules.vRule3) {
    const result = hierarchySmush(top, bottom);
    if (result) return result;
  }
  if (rules.vRule4 && ((top === '-' && bottom === '_') || (top === '_' && bottom === '-'))) return '=';
  return '';
}

function verticalFit(top, bottom, font) {
  if (font.rules.vLayout === FULL_WIDTH || !top.length || !bottom.length) return 'invalid';
  let ends = false;
  const width = Math.min(top.length, bottom.length);
  for (let i = 0; i < width; i++) {
    if (top[i] === ' ' || bottom[i] === ' ') continue;
    if (font.rules.vLayout === FITTING) return 'invalid';
    if (font.rules.vLayout === UNIVERSAL_SMUSHING) return 'end';
    if (font.rules.vRule5 && top[i] === '|' && bottom[i] === '|') continue;
    if (!verticalControlledSmush(top[i], bottom[i], font.rules)) return 'invalid';
    ends = true;
  }
  return ends ? 'end' : 'valid';
}

function verticalOverlap(topRows, bottomRows, font) {
  const maximum = topRows.length;
  let distance = 1;
  while (distance <= maximum) {
    const top = topRows.slice(Math.max(0, topRows.length - distance));
    const bottom = bottomRows.slice(0, Math.min(maximum, distance));
    let result = '';
    for (let i = 0; i < bottom.length; i++) {
      const fit = verticalFit(top[i], bottom[i], font);
      if (fit === 'invalid') {
        result = fit;
        break;
      }
      if (fit === 'end') result = fit;
      else if (!result) result = 'valid';
    }
    if (result === 'invalid') return distance - 1;
    if (result === 'end') return distance;
    distance++;
  }
  return maximum;
}

function mergeVertical(topRows, bottomRows, font) {
  const width = Math.max(topRows[0]?.length || 0, bottomRows[0]?.length || 0);
  const top = topRows.map((row) => row.padEnd(width));
  const bottom = bottomRows.map((row) => row.padEnd(width));
  const overlap = verticalOverlap(top, bottom, font);
  const before = top.slice(0, Math.max(0, top.length - overlap));
  const topOverlap = top.slice(Math.max(0, top.length - overlap));
  const bottomOverlap = bottom.slice(0, overlap);
  const middle = topOverlap.map((row, rowIndex) => {
    if (rowIndex >= bottomOverlap.length) return row;
    let merged = '';
    for (let i = 0; i < width; i++) {
      const topChar = row[i];
      const bottomChar = bottomOverlap[rowIndex][i];
      if (topChar !== ' ' && bottomChar !== ' ' && font.rules.vLayout === CONTROLLED_SMUSHING) {
        merged += verticalControlledSmush(topChar, bottomChar, font.rules) || bottomChar;
      } else merged += bottomChar === ' ' ? topChar : bottomChar;
    }
    return merged;
  });
  return [...before, ...middle, ...bottom.slice(overlap)];
}

export function renderFiglet(text, font) {
  if (typeof text !== 'string' || !font?.glyphs) throw new TypeError('Text and a parsed FIGfont are required.');
  const logicalLines = text.replace(/\r\n?/g, '\n').split('\n');
  const banners = logicalLines.map((line) => renderLine(line, font))
    .filter((rows) => rows.some((row) => row.length));
  if (!banners.length) return '';
  const output = banners.slice(1).reduce((rows, next) => mergeVertical(rows, next, font), banners[0]);
  return output.join('\n');
}
