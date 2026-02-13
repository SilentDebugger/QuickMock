/**
 * Generate PNG icons for the Chrome extension.
 *
 * Usage: node generate-icons.js
 *
 * Creates icon16.png, icon32.png, icon48.png, icon128.png in the icons/ directory.
 * Uses pure JS to write minimal valid PNG files (no dependencies needed).
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ICONS_DIR = path.join(__dirname, 'icons');
const SIZES = [16, 32, 48, 128];

// ── Minimal PNG encoder ──────────────────────────────────────

function createPNG(width, height, pixels) {
  // pixels is a Uint8Array of RGBA values (width * height * 4)
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT: filter rows (prepend 0 = None to each row)
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter byte
    pixels.copy(rawData, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(rawData);

  const chunks = [
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ];

  return Buffer.concat([signature, ...chunks]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type);
  const crc = crc32(Buffer.concat([typeBuffer, data]));
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuffer, data, crcBuffer]);
}

// CRC32 lookup table
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── Icon drawing ─────────────────────────────────────────────

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4, 0); // RGBA, all transparent

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.42;
  const innerR = outerR * 0.38;
  const bgR = size / 2;
  const ringWidth = Math.max(1.5, size * 0.06);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;

      // Anti-aliased edge function
      const aa = (d, r, w) => Math.max(0, Math.min(1, (r + w / 2 - d) / 1.0));

      // Background circle (#18181b)
      const bgAlpha = aa(dist, bgR, 0);
      if (bgAlpha > 0) {
        pixels[idx] = 0x18;
        pixels[idx + 1] = 0x18;
        pixels[idx + 2] = 0x1b;
        pixels[idx + 3] = Math.round(bgAlpha * 255);
      }

      // Outer ring (#3b82f6)
      const ringOuter = aa(dist, outerR + ringWidth / 2, 0);
      const ringInner = aa(dist, outerR - ringWidth / 2, 0);
      const ringAlpha = ringOuter - ringInner;
      if (ringAlpha > 0.01) {
        const a = Math.min(1, ringAlpha);
        pixels[idx] = blend(pixels[idx], 0x3b, a);
        pixels[idx + 1] = blend(pixels[idx + 1], 0x82, a);
        pixels[idx + 2] = blend(pixels[idx + 2], 0xf6, a);
        pixels[idx + 3] = Math.round(Math.min(1, pixels[idx + 3] / 255 + a) * 255);
      }

      // Inner dot (#ef4444)
      const dotAlpha = aa(dist, innerR, 0);
      if (dotAlpha > 0.01) {
        pixels[idx] = blend(pixels[idx], 0xef, dotAlpha);
        pixels[idx + 1] = blend(pixels[idx + 1], 0x44, dotAlpha);
        pixels[idx + 2] = blend(pixels[idx + 2], 0x44, dotAlpha);
        pixels[idx + 3] = Math.round(Math.min(1, pixels[idx + 3] / 255 + dotAlpha) * 255);
      }
    }
  }

  return pixels;
}

function blend(bg, fg, alpha) {
  return Math.round(bg * (1 - alpha) + fg * alpha);
}

// ── Main ─────────────────────────────────────────────────────

if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

for (const size of SIZES) {
  const pixels = drawIcon(size);
  const png = createPNG(size, size, pixels);
  const filePath = path.join(ICONS_DIR, `icon${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`Generated ${filePath} (${size}x${size}, ${png.length} bytes)`);
}

console.log('Done!');
