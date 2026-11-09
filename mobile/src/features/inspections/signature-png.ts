/**
 * Signature capture → the API's `strokes` and `png_base64` (the panel's
 * SignaturePad sends the same pair). The PNG is drawn here in plain
 * TypeScript instead of from a native view snapshot, so iOS, Android and the
 * web preview produce the same bytes from the same strokes: a 1-bit palette
 * image (white paper, dark ink), stored deflate. No dependency, testable.
 */

/** A point: [x, y, pressure 0-1, ms since the first point], in pad pixels. */
export type SignaturePoint = [number, number, number, number];

export type SignatureCapture = {
  width: number;
  height: number;
  strokes: SignaturePoint[][];
};

export function pointCount(c: Pick<SignatureCapture, 'strokes'>) {
  return c.strokes.reduce((n, s) => n + s.length, 0);
}

/** The API's `strokes` object (`{width, height, strokes: [[[x, y, p, t]]]}`), rounded to 0.1 px. */
export function strokesPayload(c: SignatureCapture) {
  const r = (v: number) => Math.round(v * 10) / 10;
  return {
    width: Math.max(1, Math.round(c.width)),
    height: Math.max(1, Math.round(c.height)),
    strokes: c.strokes
      .filter((s) => s.length > 0)
      .map((s) => s.map(([x, y, p, t]) => [r(x), r(y), Math.min(1, Math.max(0, p)), Math.max(0, Math.round(t))])),
  };
}

/** The panel's pen: 2.4 px, thicker with pressure. */
const LINE = 2.4;

function stamp(bits: Uint8Array, w: number, h: number, cx: number, cy: number, radius: number) {
  const r = Math.max(0.6, radius);
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(h - 1, Math.ceil(cy + r));
  const rr = r * r;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= rr) bits[y * w + x] = 1;
    }
  }
}

/** Ink bitmap (1 = ink) of the strokes at `scale`. */
export function rasterize(c: SignatureCapture, scale = 2) {
  const w = Math.max(1, Math.round(c.width * scale));
  const h = Math.max(1, Math.round(c.height * scale));
  const bits = new Uint8Array(w * h);
  for (const s of c.strokes) {
    if (s.length === 1) {
      stamp(bits, w, h, s[0][0] * scale, s[0][1] * scale, (LINE / 2) * scale);
      continue;
    }
    for (let i = 1; i < s.length; i++) {
      const [x0, y0] = s[i - 1];
      const [x1, y1, p] = s[i];
      const radius = ((LINE * (0.5 + (p || 0.5))) / 2) * scale;
      const len = Math.hypot(x1 - x0, y1 - y0) * scale;
      const steps = Math.max(1, Math.ceil(len / 0.5));
      for (let k = 0; k <= steps; k++) {
        const f = k / steps;
        stamp(bits, w, h, (x0 + (x1 - x0) * f) * scale, (y0 + (y1 - y0) * f) * scale, radius);
      }
    }
  }
  return { width: w, height: h, bits };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array, start = 0, end = bytes.length) {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** zlib stream with stored (uncompressed) deflate blocks. */
function zlibStored(data: Uint8Array) {
  const blocks = Math.max(1, Math.ceil(data.length / 65535));
  const out = new Uint8Array(2 + data.length + blocks * 5 + 4);
  let o = 0;
  out[o++] = 0x78;
  out[o++] = 0x01;
  for (let b = 0; b < blocks; b++) {
    const start = b * 65535;
    const len = Math.min(65535, data.length - start);
    out[o++] = b === blocks - 1 ? 1 : 0;
    out[o++] = len & 0xff;
    out[o++] = len >>> 8;
    out[o++] = ~len & 0xff;
    out[o++] = (~len >>> 8) & 0xff;
    out.set(data.subarray(start, start + len), o);
    o += len;
  }
  const a = adler32(data);
  out[o++] = a >>> 24;
  out[o++] = (a >>> 16) & 0xff;
  out[o++] = (a >>> 8) & 0xff;
  out[o++] = a & 0xff;
  return out;
}

function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length);
  const len = data.length;
  out[0] = len >>> 24;
  out[1] = (len >>> 16) & 0xff;
  out[2] = (len >>> 8) & 0xff;
  out[3] = len & 0xff;
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const c = crc32(out, 4, 8 + len);
  out[8 + len] = c >>> 24;
  out[9 + len] = (c >>> 16) & 0xff;
  out[10 + len] = (c >>> 8) & 0xff;
  out[11 + len] = c & 0xff;
  return out;
}

/** 1-bit palette PNG of an ink bitmap: index 0 white, 1 ink (#111827, the panel's pen). */
export function encodePNG(width: number, height: number, bits: Uint8Array) {
  const rowBytes = Math.ceil(width / 8);
  const raw = new Uint8Array((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (rowBytes + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      if (bits[y * width + x]) raw[row + 1 + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  const ihdr = new Uint8Array(13);
  ihdr[0] = width >>> 24;
  ihdr[1] = (width >>> 16) & 0xff;
  ihdr[2] = (width >>> 8) & 0xff;
  ihdr[3] = width & 0xff;
  ihdr[4] = height >>> 24;
  ihdr[5] = (height >>> 16) & 0xff;
  ihdr[6] = (height >>> 8) & 0xff;
  ihdr[7] = height & 0xff;
  ihdr[8] = 1; // bit depth
  ihdr[9] = 3; // palette
  const plte = new Uint8Array([0xff, 0xff, 0xff, 0x11, 0x18, 0x27]);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('IDAT', zlibStored(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: Uint8Array) {
  let s = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    s += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    s += B64[n >> 18] + B64[(n >> 12) & 63] + '==';
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    s += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=';
  }
  return s;
}

/** The PNG the API stores (base64, no `data:` prefix). */
export function signaturePNG(c: SignatureCapture, scale = 2) {
  const r = rasterize(c, scale);
  return toBase64(encodePNG(r.width, r.height, r.bits));
}
