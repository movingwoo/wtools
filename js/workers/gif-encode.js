import { encodeGif } from '../lib/media/gif.js';

self.onmessage = ({ data }) => {
  const { id, rgba, width, height, options } = data;
  try {
    const bytes = encodeGif(new Uint8Array(rgba), width, height, options);
    self.postMessage({ id, bytes: bytes.buffer }, [bytes.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error?.message || String(error) });
  }
};
