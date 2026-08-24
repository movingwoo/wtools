function normalizedBase64(value) {
  return String(value).replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
}

export function bytesToB64(bytes) {
  const input = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  let binary = '';
  for (let offset = 0; offset < input.length; offset += 0x8000)
    binary += String.fromCharCode(...input.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

export function b64ToBytes(value) {
  let binary;
  try { binary = atob(normalizedBase64(value)); }
  catch { throw new Error('올바른 Base64 문자열이 아닙니다.'); }
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function byteLength(value) {
  return b64ToBytes(value).length;
}

export const fromByteArray = bytesToB64;
export const toByteArray = b64ToBytes;

export default Object.freeze({ byteLength, fromByteArray, toByteArray });
