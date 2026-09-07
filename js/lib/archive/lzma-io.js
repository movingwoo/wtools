// Worker-side text adapters. Never construct a full formatted result on the UI thread.
import { b64ToBytes, bytesToB64, normalizedBase64 } from '../common/base64.js';

export const LZMA_PREVIEW_CHARS = 32768;
const INPUT_LIMIT = 256 * 1024 * 1024;
const CHUNK_BYTES = 24576; // Divisible by three: Base64 chunks need no intermediate padding.
const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

export function decodeLzmaInput(text, format, maxBytes = INPUT_LIMIT) {
  const check = (length) => {
    if (length > maxBytes) throw new Error(`LZMA 입력이 안전 한도 ${maxBytes.toLocaleString()}바이트를 넘습니다.`);
  };
  let bytes;
  if (format === 'text') {
    check(text.length);
    let length = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code < 0x80) length++;
      else if (code < 0x800) length += 2;
      else if (code >= 0xd800 && code <= 0xdbff
          && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) {
        length += 4;
        i++;
      } else length += 3;
      check(length);
    }
    bytes = new TextEncoder().encode(text);
  } else if (format === 'hex') {
    const value = text.replace(/[\s:,-]|0x/gi, '');
    if (value.length % 2 || !/^[0-9a-f]*$/i.test(value)) throw new Error('올바른 Hex 문자열이 아닙니다.');
    check(value.length / 2);
    bytes = new Uint8Array(value.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
  } else if (format === 'base64') {
    const value = normalizedBase64(text);
    check(Math.floor(value.replace(/=+$/, '').length * 3 / 4));
    bytes = b64ToBytes(value);
  } else throw new Error('지원하지 않는 LZMA 입력 형식입니다.');
  check(bytes.length);
  return bytes;
}

export function formatLzmaOutput(bytes, format) {
  if (!['text', 'hex', 'base64'].includes(format)) throw new Error('지원하지 않는 LZMA 출력 형식입니다.');
  const decoder = format === 'text' ? new TextDecoder() : null;
  const parts = [];
  let preview = '', characters = 0;
  const append = (text) => {
    characters += text.length;
    if (preview.length < LZMA_PREVIEW_CHARS) preview += text.slice(0, LZMA_PREVIEW_CHARS - preview.length);
    // Blob parts retain bytes, not an array of all full-size JavaScript strings.
    parts.push(new Blob([text]));
  };
  for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
    const chunk = bytes.subarray(offset, offset + CHUNK_BYTES);
    if (decoder) append(decoder.decode(chunk, { stream: true }));
    else if (format === 'base64') append(bytesToB64(chunk));
    else {
      const hex = new Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) hex[i] = HEX[chunk[i]];
      append(hex.join(''));
    }
  }
  if (decoder) append(decoder.decode());
  const truncated = characters > preview.length;
  const last = preview.charCodeAt(preview.length - 1);
  if (truncated && last >= 0xd800 && last <= 0xdbff) preview = preview.slice(0, -1);
  return { preview, characters, truncated, blob: new Blob(parts, { type: 'text/plain;charset=utf-8' }) };
}
