// Shared, DOM-independent crypto byte contracts. No input values in errors.
export const MAX_CRYPTO_BYTES = 16 * 1024 * 1024;
export const MAX_KEY_BYTES = 64 * 1024;

export function bytes(value) {
  if (!(value instanceof Uint8Array)) throw new TypeError('암호 입력은 바이트 배열이어야 합니다.');
  return value;
}

export function limit(value, maximum = MAX_CRYPTO_BYTES) {
  bytes(value);
  if (value.length > maximum) throw new Error(`암호 입력은 ${maximum.toLocaleString('ko-KR')}바이트 이하여야 합니다.`);
  return value;
}

const HEX = Array.from({ length: 256 }, (_, b) => b.toString(16).padStart(2, '0'));
export function hex(value) {
  bytes(value);
  const parts = [], chunk = new Array(8192);
  for (let offset = 0; offset < value.length; offset += 8192) {
    chunk.length = Math.min(8192, value.length - offset);
    for (let i = 0; i < chunk.length; i++) chunk[i] = HEX[value[offset + i]];
    parts.push(chunk.join(''));
  }
  return parts.join('');
}

export function unhex(value) {
  const text = value.replace(/\s/g, '');
  if (text.length % 2 || /[^0-9a-f]/i.test(text)) throw new Error('올바른 Hex 문자열을 입력하세요.');
  const out = new Uint8Array(text.length / 2);
  const nibble = (code) => code <= 57 ? code - 48 : (code | 32) - 87;
  for (let i = 0; i < out.length; i++) out[i] = (nibble(text.charCodeAt(i * 2)) << 4) | nibble(text.charCodeAt(i * 2 + 1));
  return out;
}

export function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

// Full scan for equal-length secrets. JavaScript engines cannot promise constant timing.
export function equal(a, b) {
  bytes(a); bytes(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] || 0) ^ (b[i] || 0);
  return diff === 0;
}

export function random(length) {
  if (!globalThis.crypto?.getRandomValues) throw new Error('이 브라우저는 안전한 난수 생성을 지원하지 않습니다.');
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}
