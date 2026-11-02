import { bytes } from './bytes.js';

// Streaming Merkle–Damgård padding; memory does not grow with the message.
export class BlockHash {
  constructor(state, blockSize, digestSize, littleEndian, transform) {
    this.state = new Uint32Array(state);
    this.block = new Uint8Array(blockSize);
    this.digestSize = digestSize;
    this.littleEndian = littleEndian;
    this.transform = transform;
    this.used = 0;
    this.length = 0;
    this.result = null;
    this.closed = false;
  }

  update(input) {
    bytes(input);
    if (this.closed) throw new Error('해시 계산이 이미 완료되었습니다.');
    if (!Number.isSafeInteger(this.length + input.length)) throw new Error('해시 입력 길이 한도를 초과했습니다.');
    this.length += input.length;
    let offset = 0;
    if (this.used) {
      const n = Math.min(this.block.length - this.used, input.length);
      this.block.set(input.subarray(0, n), this.used);
      this.used += n;
      offset = n;
      if (this.used === this.block.length) {
        this.transform(this.block, 0);
        this.used = 0;
      }
    }
    while (offset + this.block.length <= input.length) {
      this.transform(input, offset);
      offset += this.block.length;
    }
    if (offset < input.length) {
      this.block.set(input.subarray(offset));
      this.used = input.length - offset;
    }
    return this;
  }

  digest() {
    if (this.result) return this.result.slice();
    if (this.closed) throw new Error('해시 작업이 종료되었습니다.');
    const n = this.block.length;
    const tail = n === 128 ? 16 : 8;
    this.block[this.used++] = 0x80;
    if (this.used > n - tail) {
      this.block.fill(0, this.used);
      this.transform(this.block, 0);
      this.used = 0;
    }
    this.block.fill(0, this.used);
    const view = new DataView(this.block.buffer);
    const low = (this.length % 0x20000000) * 8;
    const high = Math.floor(this.length / 0x20000000);
    view.setUint32(n - (this.littleEndian ? 8 : 4), low, this.littleEndian);
    view.setUint32(n - (this.littleEndian ? 4 : 8), high, this.littleEndian);
    this.transform(this.block, 0);
    const output = new Uint8Array(this.state.length * 4);
    const outView = new DataView(output.buffer);
    this.state.forEach((word, i) => outView.setUint32(i * 4, word, this.littleEndian));
    this.result = output.slice(0, this.digestSize);
    output.fill(0);
    this.destroy();
    return this.result.slice();
  }

  destroy() {
    this.closed = true;
    this.state.fill(0);
    this.block.fill(0);
    this.words?.fill(0);
    this.length = this.used = 0;
  }
}
