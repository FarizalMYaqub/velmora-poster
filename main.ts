// VELMORA — Isles of the Amber Sea
// A travel poster for a place that does not exist.
// Pure Node 22, no dependencies, no network. Renders a 1024x1024 PNG
// (hand-rolled rasterizer + PNG encoder) to /output/entry.png.
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;
const outPath = process.env.OUTPUT_PATH || "/output/entry.png";

// ---------------------------------------------------------------- raster
const buf = new Uint8Array(W * H * 3);

type RGB = [number, number, number];

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function setPx(x: number, y: number, c: RGB): void {
  const xi = x | 0;
  const yi = y | 0;
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
  const o = (yi * W + xi) * 3;
  buf[o] = clamp(c[0], 0, 255);
  buf[o + 1] = clamp(c[1], 0, 255);
  buf[o + 2] = clamp(c[2], 0, 255);
}

function blendPx(x: number, y: number, c: RGB, a: number): void {
  const xi = x | 0;
  const yi = y | 0;
  if (xi < 0 || yi < 0 || xi >= W || yi >= H || a <= 0) return;
  if (a >= 1) return setPx(xi, yi, c);
  const o = (yi * W + xi) * 3;
  buf[o] = Math.round(buf[o] * (1 - a) + c[0] * a);
  buf[o + 1] = Math.round(buf[o + 1] * (1 - a) + c[1] * a);
  buf[o + 2] = Math.round(buf[o + 2] * (1 - a) + c[2] * a);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];
}

function fillRect(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  for (let y = Math.max(0, y0 | 0); y <= Math.min(H - 1, y1 | 0); y++) {
    for (let x = Math.max(0, x0 | 0); x <= Math.min(W - 1, x1 | 0); x++) {
      setPx(x, y, c);
    }
  }
}

function hline(x0: number, x1: number, y: number, c: RGB): void {
  for (let x = Math.min(x0, x1) | 0; x <= (Math.max(x0, x1) | 0); x++) setPx(x, y, c);
}

function vline(x: number, y0: number, y1: number, c: RGB): void {
  for (let y = Math.min(y0, y1) | 0; y <= (Math.max(y0, y1) | 0); y++) setPx(x, y, c);
}

function line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let i = 0; i <= steps; i++) {
    setPx(Math.round(x0 + (dx * i) / steps), Math.round(y0 + (dy * i) / steps), c);
  }
}

function disc(cx: number, cy: number, r: number, c: RGB, alpha = 1): void {
  for (let y = Math.ceil(cy - r); y <= Math.floor(cy + r); y++) {
    for (let x = Math.ceil(cx - r); x <= Math.floor(cx + r); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) blendPx(x, y, c, alpha);
    }
  }
}

function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, alpha = 1): void {
  for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++) {
    for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) blendPx(x, y, c, alpha);
    }
  }
}

function ellipseOutline(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  c: RGB,
  thick: number,
  rot: number,
): void {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  for (let deg = 0; deg < 360; deg += 0.25) {
    const a = (deg * Math.PI) / 180;
    const ex = Math.cos(a) * rx;
    const ey = Math.sin(a) * ry;
    const x = cx + ex * cos - ey * sin;
    const y = cy + ex * sin + ey * cos;
    for (let t = -thick; t <= thick; t++) {
      blendPx(Math.round(x + t * 0.4), Math.round(y + t * 0.4), c, 0.95);
    }
  }
}

// Scanline polygon fill.
function poly(points: Array<[number, number]>, c: RGB): void {
  let minY = H;
  let maxY = 0;
  for (const [, y] of points) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % points.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      hline(Math.ceil(xs[k]), Math.floor(xs[k + 1]), y, c);
    }
  }
}

// ------------------------------------------------------------------ font
// Compact 5x7 pixel font, drawn scaled. Only the glyphs the poster needs.
const GLYPHS: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
};

function textWidth(text: string, scale: number): number {
  return text.length * 6 * scale - scale;
}

function drawText(
  text: string,
  cx: number,
  y: number,
  scale: number,
  c: RGB,
  outline?: RGB,
): void {
  const w = textWidth(text, scale);
  let x = Math.round(cx - w / 2);
  const draw = (ox: number, oy: number, col: RGB) => {
    let px = x + ox;
    for (const ch of text) {
      const g = GLYPHS[ch] || GLYPHS[" "];
      for (let row = 0; row < 7; row++) {
        for (let colI = 0; colI < 5; colI++) {
          if (g[row][colI] === "1") {
            fillRect(px + colI * scale, y + oy + row * scale, px + colI * scale + scale - 1, y + oy + row * scale + scale - 1, col);
          }
        }
      }
      px += 6 * scale;
    }
  };
  if (outline) {
    const o = Math.max(2, Math.round(scale * 0.35));
    for (const [ox, oy] of [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, -o], [-o, o], [o, o]] as const) {
      draw(ox, oy, outline);
    }
  }
  draw(0, 0, c);
}

// ------------------------------------------------------------------ scene
const TEAL_DEEP: RGB = [14, 58, 63];
const TEAL_MID: RGB = [38, 110, 108];
const AMBER: RGB = [232, 163, 76];
const AMBER_SOFT: RGB = [240, 196, 120];
const CREAM: RGB = [247, 234, 208];
const INK: RGB = [13, 47, 51];
const SEA_DEEP: RGB = [16, 72, 80];
const ISLE: RGB = [16, 52, 54];
const FOLIAGE: RGB = [30, 107, 82];

function sky(): void {
  const stops: Array<[number, RGB]> = [
    [0, [10, 44, 52]],
    [0.35, TEAL_DEEP],
    [0.62, TEAL_MID],
    [0.82, [214, 138, 74]],
    [1, [240, 178, 96]],
  ];
  for (let y = 0; y < 660; y++) {
    const t = y / 660;
    let a = stops[0];
    let b = stops[stops.length - 1];
    for (let i = 0; i + 1 < stops.length; i++) {
      if (t >= stops[i][0] && t <= stops[i + 1][0]) {
        a = stops[i];
        b = stops[i + 1];
        break;
      }
    }
    const lt = (t - a[0]) / Math.max(0.0001, b[0] - a[0]);
    hline(0, W - 1, y, lerpColor(a[1], b[1], clamp(lt, 0, 1)));
  }
}

function stars(): void {
  // Deterministic pseudo-random star field, upper sky only.
  let seed = 1234567;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(rnd() * W);
    const y = Math.floor(rnd() * 300);
    const a = 0.25 + rnd() * 0.55;
    blendPx(x, y, CREAM, a);
    if (rnd() > 0.7) blendPx(x + 1, y, CREAM, a * 0.6);
  }
}

function ringedPlanet(): void {
  const cx = 772;
  const cy = 208;
  const r = 108;
  // Halo.
  disc(cx, cy, r + 26, [240, 200, 130], 0.12);
  disc(cx, cy, r + 10, [240, 200, 130], 0.18);
  // Body with a soft vertical shade.
  for (let y = cy - r; y <= cy + r; y++) {
    const dy = (y - cy) / r;
    const half = Math.sqrt(Math.max(0, 1 - dy * dy)) * r;
    const shade = clamp(0.62 + (1 - (y - (cy - r)) / (2 * r)) * 0.45, 0, 1.05);
    const col: RGB = [
      Math.round(242 * shade),
      Math.round(212 * shade),
      Math.round(146 * shade),
    ];
    for (let x = Math.ceil(cx - half); x <= Math.floor(cx + half); x++) {
      setPx(x, y, col);
    }
  }
  // Bands.
  for (let i = 0; i < 5; i++) {
    const by = cy - 52 + i * 26;
    const dy = (by - cy) / r;
    const half = Math.sqrt(Math.max(0, 1 - dy * dy)) * r;
    hline(cx - half, cx + half, by, [214, 170, 104]);
    hline(cx - half, cx + half, by + 1, [214, 170, 104]);
  }
  // Ring, tilted, drawn front and back.
  ellipseOutline(cx, cy, r + 78, 26, [222, 172, 96], 5, -0.32);
  ellipseOutline(cx, cy, r + 96, 34, [240, 205, 140], 3, -0.32);
}

function sun(): void {
  const cx = 248;
  const cy = 566;
  disc(cx, cy, 150, [255, 196, 110], 0.14);
  disc(cx, cy, 110, [255, 205, 130], 0.2);
  disc(cx, cy, 74, [255, 222, 150], 1);
  disc(cx, cy, 58, [255, 236, 180], 1);
}

function sea(): void {
  for (let y = 660; y < H; y++) {
    const t = (y - 660) / (H - 660);
    hline(0, W - 1, y, lerpColor([216, 150, 72], SEA_DEEP, clamp(t * 1.15, 0, 1)));
  }
  // Sun glitter on the water.
  let seed = 777;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < 260; i++) {
    const y = 668 + Math.floor(rnd() * 330);
    const spread = 60 + (y - 660) * 0.9;
    const x = 248 + Math.floor((rnd() - 0.5) * 2 * spread);
    const len = 6 + Math.floor(rnd() * 26);
    hline(x, x + len, y, [255, 214, 140]);
  }
  // Gentle wave lines.
  for (let i = 0; i < 46; i++) {
    const y = 690 + i * 7;
    const x0 = (i * 173) % 900;
    hline(x0, x0 + 60 + (i % 5) * 22, y, [28, 96, 102]);
  }
}

function island(
  cx: number,
  topY: number,
  w: number,
  depth: number,
  withHouses: boolean,
): void {
  // Top: grassy dome.
  poly(
    [
      [cx - w / 2, topY + 26],
      [cx - w * 0.32, topY],
      [cx, topY - 14],
      [cx + w * 0.32, topY],
      [cx + w / 2, topY + 26],
    ],
    FOLIAGE,
  );
  // Rock body tapering down to a point (floating island underside).
  poly(
    [
      [cx - w / 2, topY + 24],
      [cx + w / 2, topY + 24],
      [cx + w * 0.2, topY + depth],
      [cx, topY + depth + 34],
      [cx - w * 0.2, topY + depth],
    ],
    ISLE,
  );
  // Amber rim light on the right edge.
  line(cx + w * 0.32, topY + 2, cx + w * 0.2, topY + depth, AMBER);
  line(cx + w * 0.32, topY + 2, cx + w / 2, topY + 24, AMBER_SOFT);
  // Trees: small triangles.
  const treeX = [cx - w * 0.28, cx - w * 0.08, cx + w * 0.12, cx + w * 0.3];
  for (const tx of treeX) {
    poly(
      [
        [tx, topY - 26],
        [tx - 9, topY + 2],
        [tx + 9, topY + 2],
      ],
      [18, 84, 62],
    );
  }
  if (withHouses) {
    // Two tiny houses with lit windows.
    for (const hx of [cx - w * 0.18, cx + w * 0.05]) {
      fillRect(hx, topY - 22, hx + 26, topY + 2, [58, 42, 30]);
      poly(
        [
          [hx - 3, topY - 22],
          [hx + 13, topY - 34],
          [hx + 29, topY - 22],
        ],
        [150, 84, 52],
      );
      fillRect(hx + 8, topY - 14, hx + 14, topY - 6, [255, 214, 130]);
    }
  }
}

function waterfall(x: number, y0: number, y1: number): void {
  // Near-continuous falling water: solid thin streams with soft alpha.
  for (let i = 0; i < 5; i++) {
    const wx = x + (i - 2) * 4;
    for (let y = y0; y < y1; y++) {
      blendPx(wx, y, [220, 238, 230], y % 2 === 0 ? 0.8 : 0.45);
    }
  }
  disc(x, y1, 12, [226, 240, 232], 0.45);
}

function airship(cx: number, cy: number): void {
  // Balloon.
  ellipse(cx, cy, 132, 52, [201, 111, 63], 1);
  ellipse(cx, cy - 8, 120, 40, [232, 163, 76], 1);
  ellipse(cx, cy - 16, 96, 26, [247, 214, 150], 1);
  // Balloon stripes.
  for (const sx of [-66, 0, 66]) {
    ellipse(cx + sx, cy, 10, 50, [150, 84, 52], 0.85);
  }
  // Fins.
  poly(
    [
      [cx + 118, cy - 6],
      [cx + 168, cy - 34],
      [cx + 158, cy + 8],
    ],
    [150, 84, 52],
  );
  // Gondola + rigging.
  line(cx - 60, cy + 44, cx - 30, cy + 74, [58, 42, 30]);
  line(cx + 60, cy + 44, cx + 30, cy + 74, [58, 42, 30]);
  fillRect(cx - 46, cy + 74, cx + 46, cy + 96, [58, 42, 30]);
  for (let i = 0; i < 4; i++) {
    fillRect(cx - 36 + i * 20, cy + 80, cx - 26 + i * 20, cy + 90, [255, 214, 130]);
  }
}

function birds(): void {
  const spots: Array<[number, number, number]> = [
    [120, 180, 10],
    [170, 150, 8],
    [420, 210, 9],
    [640, 140, 8],
    [880, 330, 10],
    [920, 300, 7],
    [330, 120, 7],
  ];
  for (const [x, y, s] of spots) {
    line(x - s, y, x, y - s * 0.5, INK);
    line(x, y - s * 0.5, x + s, y, INK);
  }
}

function frame(): void {
  // Thin double border, classic poster.
  for (let t = 0; t < 6; t++) {
    hline(18 + t, W - 19 - t, 18 + t, CREAM);
    hline(18 + t, W - 19 - t, H - 19 - t, CREAM);
    vline(18 + t, 18 + t, H - 19 - t, CREAM);
    vline(W - 19 - t, 18 + t, H - 19 - t, CREAM);
  }
  for (let t = 0; t < 2; t++) {
    hline(34 + t, W - 35 - t, 34 + t, AMBER);
    hline(34 + t, W - 35 - t, H - 35 - t, AMBER);
    vline(34 + t, 34 + t, H - 35 - t, AMBER);
    vline(W - 35 - t, 34 + t, H - 35 - t, AMBER);
  }
}

// ------------------------------------------------------------------- png
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(): Buffer {
  // Try two row filters; keep the smaller deflate stream.
  let best: Buffer | null = null;
  for (const filter of [0, 2]) {
    const raw = Buffer.alloc(H * (1 + W * 3));
    for (let y = 0; y < H; y++) {
      const rowOff = y * (1 + W * 3);
      raw[rowOff] = filter;
      for (let x = 0; x < W * 3; x++) {
        const src = (y * W * 3 + x) | 0;
        if (filter === 0) {
          raw[rowOff + 1 + x] = buf[src];
        } else {
          const above = y > 0 ? buf[(y - 1) * W * 3 + x] : 0;
          raw[rowOff + 1 + x] = (buf[src] - above) & 0xff;
        }
      }
    }
    const deflated = zlib.deflateSync(raw, { level: 9 });
    if (!best || deflated.length < best.length) best = deflated;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", best as Buffer),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ main
function main(): void {
  sky();
  stars();
  ringedPlanet();
  sun();
  sea();
  island(300, 430, 380, 120, true);
  island(760, 470, 260, 90, false);
  island(560, 520, 130, 55, false);
  waterfall(210, 560, 660);
  waterfall(700, 560, 660);
  airship(540, 330);
  birds();
  frame();
  drawText("VELMORA", 512, 782, 17, CREAM, INK);
  drawText("ISLES OF THE AMBER SEA", 512, 922, 6, AMBER_SOFT, INK);

  const png = encodePNG();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, png);
  console.log(`wrote ${outPath} (${png.length} bytes, ${W}x${H})`);
}

main();
