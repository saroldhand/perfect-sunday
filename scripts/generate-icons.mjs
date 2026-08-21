// Generates the PWA icon set. Run with: node scripts/generate-icons.mjs
//
// Writes PNGs directly with zlib rather than pulling in an image library. The
// mark is a 4x4 grid of sixteen squares — one game per square, the shape of the
// share grid — with a single dark square standing in for the miss. Fifteen of
// sixteen is the product.
//
// Output is committed, so CI never runs this.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

const BG = [0x0b, 0x0d, 0x10, 0xff]; // --color-bg
const ACCENT = [0xf5, 0xc5, 0x18, 0xff]; // --color-accent
const MISS = [0x27, 0x2d, 0x35, 0xff]; // --color-border

const GRID = 4;
const MISS_CELL = { row: 2, col: 3 }; // one dark square, off-centre

// --- PNG encoding ----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with its filter byte. Filter 0 (none) keeps this
  // simple; the images are flat colour so deflate handles them well anyway.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- the mark --------------------------------------------------------------

function drawIcon(size, contentFraction) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    rgba.set(BG, i * 4);
  }

  // Content is inset so a maskable icon survives being cropped to a circle.
  const content = Math.round(size * contentFraction);
  const origin = Math.round((size - content) / 2);
  const gap = Math.max(1, Math.round(content * 0.06));
  const cell = Math.floor((content - gap * (GRID - 1)) / GRID);

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const colour = row === MISS_CELL.row && col === MISS_CELL.col ? MISS : ACCENT;
      const x0 = origin + col * (cell + gap);
      const y0 = origin + row * (cell + gap);
      for (let y = y0; y < y0 + cell; y++) {
        for (let x = x0; x < x0 + cell; x++) {
          if (x < 0 || y < 0 || x >= size || y >= size) continue;
          rgba.set(colour, (y * size + x) * 4);
        }
      }
    }
  }

  return encodePng(size, size, rgba);
}

// --- write -----------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  { file: "icon-192.png", size: 192, fraction: 0.72 },
  { file: "icon-512.png", size: 512, fraction: 0.72 },
  // Maskable icons get cropped to whatever shape the launcher uses, so the
  // mark sits inside the central safe zone with room to spare.
  { file: "icon-maskable-512.png", size: 512, fraction: 0.56 },
  { file: "apple-touch-icon.png", size: 180, fraction: 0.72 },
];

for (const { file, size, fraction } of targets) {
  const png = drawIcon(size, fraction);
  writeFileSync(join(OUT_DIR, file), png);
  console.log(`${file}  ${size}x${size}  ${png.length} bytes`);
}
