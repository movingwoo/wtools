import { decodeQr } from '../lib/qr/decoder.js';

self.onmessage = ({ data }) => {
  const { id, pixels, width, height } = data;
  try {
    const result = decodeQr(new Uint8ClampedArray(pixels), width, height);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error?.message || String(error) });
  }
};
