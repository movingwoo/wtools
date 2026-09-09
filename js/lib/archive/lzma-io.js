// Preserve the LZMA adapter API while sharing bounded Worker-side formatting.
import { decodeCodecInput, formatCodecOutput } from './codec-io.js';
export { CODEC_PREVIEW_CHARS as LZMA_PREVIEW_CHARS } from './codec-io.js';

export function decodeLzmaInput(text, format, maxBytes) {
  return decodeCodecInput(text, format, maxBytes, 'LZMA');
}

export function formatLzmaOutput(bytes, format) {
  return formatCodecOutput(bytes, format, 'LZMA');
}
