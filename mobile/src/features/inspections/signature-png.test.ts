import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';

import { crc32, pointCount, signaturePNG, strokesPayload, toBase64, type SignatureCapture } from './signature-png.ts';

const capture: SignatureCapture = {
  width: 100,
  height: 40,
  strokes: [
    [
      [10, 20, 0.5, 0],
      [50, 20, 0.6, 16],
      [90, 30, 1.4, 33.3],
    ],
    [[50, 5, 0.5, 80]],
  ],
};

test('strokes payload matches the API shape and clamps pressure', () => {
  const p = strokesPayload(capture);
  assert.equal(p.width, 100);
  assert.equal(p.height, 40);
  assert.deepEqual(p.strokes[0][2], [90, 30, 1, 33]);
  assert.equal(pointCount(capture), 4);
});

test('base64 matches Buffer', () => {
  for (const n of [0, 1, 2, 3, 4, 5, 100]) {
    const b = new Uint8Array(Array.from({ length: n }, (_, i) => (i * 37) & 255));
    assert.equal(toBase64(b), Buffer.from(b).toString('base64'));
  }
  assert.equal(crc32(new TextEncoder().encode('IEND')), 0xae426082);
});

test('the PNG decodes to the pad size with ink on the stroke and paper elsewhere', () => {
  const png = Buffer.from(signaturePNG(capture, 2), 'base64');
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.readUInt32BE(16), 200);
  assert.equal(png.readUInt32BE(20), 80);
  let o = 8;
  const idat: Buffer[] = [];
  while (o < png.length) {
    const len = png.readUInt32BE(o);
    const type = png.toString('ascii', o + 4, o + 8);
    assert.equal(png.readUInt32BE(o + 8 + len), crc32(png, o + 4, o + 8 + len), `crc of ${type}`);
    if (type === 'IDAT') idat.push(png.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const rowBytes = Math.ceil(200 / 8) + 1;
  assert.equal(raw.length, rowBytes * 80);
  const ink = (x: number, y: number) => (raw[y * rowBytes + 1 + (x >> 3)] >> (7 - (x & 7))) & 1;
  assert.equal(ink(60, 40), 1); // on the first segment (y = 20 px × 2)
  assert.equal(ink(100, 10), 1); // the dot at (50, 5)
  assert.equal(ink(10, 75), 0);
  assert.ok(png.length < 2 << 20);
});
