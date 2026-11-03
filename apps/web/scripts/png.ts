import { deflateSync } from 'node:zlib';

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Buffer) {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Arte fictícia (PNG) para o seed: fundo com gradiente e faixas diagonais, sem dependências. */
export function makePng(
  w: number,
  h: number,
  base: [number, number, number],
  accent: [number, number, number],
): Uint8Array {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const stripe = Math.floor((x + y) / 28) % 2 === 0;
      const circle = (x - w * 0.5) ** 2 + (y - h * 0.42) ** 2 < (w * 0.28) ** 2;
      const k = y / h;
      const c = circle ? accent : base;
      const o = y * (w * 3 + 1) + 1 + x * 3;
      for (let i = 0; i < 3; i++)
        raw[o + i] = Math.max(
          0,
          Math.min(255, Math.round(c[i]! * (1 - 0.18 * k) + (stripe && !circle ? 10 : 0))),
        );
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
