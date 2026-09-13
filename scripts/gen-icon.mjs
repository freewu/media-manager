/**
 * 生成应用图标 app-icon.png（1024x1024，圆角渐变 + 播放按钮）。
 * 之后执行 `npm run tauri icon app-icon.png` 即可生成各平台图标。
 *
 * 用法：node scripts/gen-icon.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const SIZE = 1024;
const RADIUS = 210; // 圆角半径
const SS = 2; // 超采样倍数（抗锯齿）

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** 圆角矩形内部距离（<0 在内部） */
function roundedRectDistance(x, y, halfW, halfH, r) {
  const qx = Math.abs(x) - (halfW - r);
  const qy = Math.abs(y) - (halfH - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

/** 点到线段的距离 */
function segmentDistance(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const t = clamp01((apx * abx + apy * aby) / (abx * abx + aby * aby));
  return Math.hypot(apx - abx * t, apy - aby * t);
}

/** 三角形内部判定 + 抗锯齿：返回 0..1 的覆盖率 */
function triangleCoverage(px, py, pts) {
  const [a, b, c] = pts;
  const sign = (p1, p2, p3) =>
    (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const d1 = sign([px, py], a, b);
  const d2 = sign([px, py], b, c);
  const d3 = sign([px, py], c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return hasNeg && hasPos ? 0 : 1;
}

const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const FROM = rgb("#5b8cff");
const TO = rgb("#8b5bff");

// 播放三角形（相对中心的坐标）
const tri = [
  [-118, -168],
  [-118, 168],
  [196, 0],
];

const pixels = Buffer.alloc(SIZE * SIZE * 4);

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let rAcc = 0;
    let gAcc = 0;
    let bAcc = 0;
    let aAcc = 0;

    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const px = x + (sx + 0.5) / SS;
        const py = y + (sy + 0.5) / SS;
        const cx = px - SIZE / 2;
        const cy = py - SIZE / 2;

        const coverage = 1 - smoothstep(0, 1.4, roundedRectDistance(cx, cy, SIZE / 2, SIZE / 2, RADIUS));
        if (coverage <= 0) continue;

        // 对角渐变
        const t = clamp01((cx + cy + SIZE) / (2 * SIZE));
        let r = FROM[0] + (TO[0] - FROM[0]) * t;
        let g = FROM[1] + (TO[1] - FROM[1]) * t;
        let b = FROM[2] + (TO[2] - FROM[2]) * t;

        // 左上角柔光
        const glow = Math.max(0, 1 - Math.hypot(cx + 250, cy + 280) / 620) * 0.22;
        r += (255 - r) * glow;
        g += (255 - g) * glow;
        b += (255 - b) * glow;

        // 白色播放按钮
        const play = triangleCoverage(px - SIZE / 2, py - SIZE / 2, tri);
        if (play > 0) {
          r += (255 - r) * play;
          g += (255 - g) * play;
          b += (255 - b) * play;
        }

        rAcc += r * coverage;
        gAcc += g * coverage;
        bAcc += b * coverage;
        aAcc += 255 * coverage;
      }
    }

    const samples = SS * SS;
    const idx = (y * SIZE + x) * 4;
    const alpha = aAcc / samples;
    if (alpha > 0) {
      pixels[idx] = Math.round(rAcc / samples);
      pixels[idx + 1] = Math.round(gAcc / samples);
      pixels[idx + 2] = Math.round(bAcc / samples);
      pixels[idx + 3] = Math.round(alpha);
    }
  }
}

// ------------------------------------------------------------------ PNG 编码

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
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([length, typeBuf, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

// 每行前加一个 filter 字节（0 = None）
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const outPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "app-icon.png");
writeFileSync(outPath, png);
console.log(`已生成 ${outPath} (${SIZE}x${SIZE}, ${(png.length / 1024).toFixed(0)} KB)`);
