/**
 * News Collage Generator - 23 November 2026
 * Generates a 512x512 PNG via Node stdlib only (zlib + CRC32)
 * Refactored v2: cleaner structure, improved motifs, better text layout
 */

// ============================================================
// 5x7 Bitmap Font (uppercase A-Z, 0-9, punctuation, space)
// Each char: 5 wide x 7 high, 1-bit per pixel (MSB first, bits 4-0)
// Renderer uses mask 0x10 >>> gx (bits 4,3,2,1,0)
// ============================================================
const FONT_5x7: Record<string, number[]> = {
  '0': [0x0f, 0x11, 0x11, 0x15, 0x11, 0x11, 0x0f],
  '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0f, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
  '3': [0x0f, 0x11, 0x01, 0x0f, 0x01, 0x11, 0x0f],
  '4': [0x02, 0x06, 0x0e, 0x12, 0x1f, 0x02, 0x02],
  '5': [0x1f, 0x10, 0x10, 0x0f, 0x01, 0x11, 0x0f],
  '6': [0x0f, 0x10, 0x10, 0x1f, 0x11, 0x11, 0x0f],
  '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0f, 0x11, 0x11, 0x0f, 0x11, 0x11, 0x0f],
  '9': [0x0f, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  'A': [0x0f, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  'B': [0x1f, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x1f],
  'C': [0x0f, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0f],
  'D': [0x1f, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1f],
  'E': [0x1f, 0x10, 0x10, 0x1f, 0x10, 0x10, 0x1f],
  'F': [0x1f, 0x10, 0x10, 0x1f, 0x10, 0x10, 0x10],
  'G': [0x0f, 0x11, 0x10, 0x13, 0x11, 0x11, 0x0f],
  'H': [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  'I': [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x1f],
  'J': [0x0e, 0x04, 0x04, 0x04, 0x04, 0x1c, 0x08],
  'K': [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  'L': [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  'M': [0x11, 0x1b, 0x1f, 0x15, 0x11, 0x11, 0x11],
  'N': [0x11, 0x11, 0x13, 0x15, 0x11, 0x11, 0x11],
  'O': [0x0f, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0f],
  'P': [0x1f, 0x11, 0x11, 0x1f, 0x10, 0x10, 0x10],
  'Q': [0x0f, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0f],
  'R': [0x1f, 0x11, 0x11, 0x1f, 0x14, 0x12, 0x11],
  'S': [0x0f, 0x11, 0x10, 0x0f, 0x01, 0x11, 0x0f],
  'T': [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  'U': [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0f],
  'V': [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  'W': [0x11, 0x11, 0x11, 0x15, 0x1f, 0x1b, 0x11],
  'X': [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  'Y': [0x11, 0x11, 0x11, 0x0a, 0x04, 0x04, 0x04],
  'Z': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  ':': [0x00, 0x04, 0x04, 0x00, 0x00, 0x04, 0x04],
  '-': [0x00, 0x00, 0x00, 0x0e, 0x00, 0x00, 0x00],
  ',': [0x00, 0x00, 0x00, 0x00, 0x04, 0x04, 0x02],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x04],
  '\'': [0x00, 0x04, 0x04, 0x00, 0x00, 0x00, 0x00],
  ' ': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  ';': [0x00, 0x04, 0x04, 0x00, 0x00, 0x04, 0x02],
};

// ============================================================
// Constants & Layout
// ============================================================
const W = 512, H = 512;
const M = 16;                    // margin
const MH = 64;                   // masthead height
const PW = (W - M * 3) / 2;      // panel width = 232
const PH = (H - MH - M * 3) / 2; // panel height = 208
const SY = MH + M;               // panel start Y = 80
const P2X = M * 2 + PW;          // right panel X = 264

// Panel vertical centers for motifs
const MOTIF_Y = SY + 52;
const MOTIF_Y2 = SY + M + PH + 52;

// ============================================================
// PNG Writer (stdlib only)
// ============================================================
function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (const b of data) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1)); }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function u32(buf: Uint8Array, o: number, v: number): void {
  buf[o] = v >>> 24; buf[o+1] = v >>> 16; buf[o+2] = v >>> 8; buf[o+3] = v;
}
function chunk(chunks: Uint8Array[], type: string, data: Uint8Array): void {
  const t = new TextEncoder().encode(type), c = new Uint8Array(12 + data.length);
  u32(c, 0, data.length); c.set(t, 4); c.set(data, 8);
  const cd = new Uint8Array(4 + data.length); cd.set(t, 0); cd.set(data, 4);
  u32(c, 8 + data.length, crc32(cd)); chunks.push(c);
}
function createPNG(img: Uint8Array): Uint8Array {
  const cs: Uint8Array[] = [];
  const ihdr = new Uint8Array(13); u32(ihdr, 0, W); u32(ihdr, 4, H); ihdr[8]=8; ihdr[9]=2; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  chunk(cs, 'IHDR', ihdr);
  const { deflateSync } = require('node:zlib');
  const raw = new Uint8Array(H * (W * 3 + 1));
  let p = 0;
  for (let y = 0; y < H; y++) { raw[p++] = 0; raw.set(img.subarray(y*W*3, y*W*3+W*3), p); p += W*3; }
  chunk(cs, 'IDAT', deflateSync(raw));  // FIX: use deflateSync (zlib stream) not deflateRawSync
  chunk(cs, 'IEND', new Uint8Array(0));
  const sig = new Uint8Array([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);
  const png = new Uint8Array(8 + cs.reduce((s,c)=>s+c.length,0));
  png.set(sig, 0); let o = 8; for (const c of cs) { png.set(c, o); o += c.length; }
  return png;
}

// ============================================================
// Canvas / Raster
// ============================================================
class Canvas {
  d: Uint8Array;
  constructor() { this.d = new Uint8Array(W * H * 3); }
  px(x: number, y: number, r: number, g: number, b: number): void {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const i = (y * W + x) * 3;
    this.d[i] = r; this.d[i+1] = g; this.d[i+2] = b;
  }
  get(x: number, y: number): number[] {
    if (x < 0 || x >= W || y < 0 || y >= H) return [0,0,0];
    const i = (y * W + x) * 3;
    return [this.d[i], this.d[i+1], this.d[i+2]];
  }
  rect(x: number, y: number, w: number, h: number, c: number[]): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.px(xx, yy, c[0], c[1], c[2]);
  }
  frame(x: number, y: number, w: number, h: number, c: number[]): void {
    this.rect(x, y, w, 1, c); this.rect(x, y+h-1, w, 1, c);
    this.rect(x, y, 1, h, c); this.rect(x+w-1, y, 1, h, c);
  }
  line(x1: number, y1: number, x2: number, y2: number, c: number[]): void {
    const dx = Math.abs(x2-x1), dy = Math.abs(y2-y1);
    const sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
    let err = (dx > dy ? dx : -dy) / 2;
    while (true) { this.px(x1, y1, c[0], c[1], c[2]); if (x1===x2 && y1===y2) break; const e2 = err; if (e2 > -dx) { err -= dy; x1 += sx; } if (e2 < dy) { err += dx; y1 += sy; } }
  }
  circle(cx: number, cy: number, r: number, c: number[]): void {
    let x = 0, y = r, d = 3 - 2*r;
    while (y >= x) {
      this.px(cx+x, cy+y, c[0], c[1], c[2]); this.px(cx+y, cy+x, c[0], c[1], c[2]);
      this.px(cx-y, cy+x, c[0], c[1], c[2]); this.px(cx-x, cy+y, c[0], c[1], c[2]);
      this.px(cx-x, cy-y, c[0], c[1], c[2]); this.px(cx-y, cy-x, c[0], c[1], c[2]);
      this.px(cx+y, cy-x, c[0], c[1], c[2]); this.px(cx+x, cy-y, c[0], c[1], c[2]);
      if (d > 0) { y--; d += 4*(x-y) + 10; } else { d += 4*x + 6; } x++;
    }
  }
  text(s: string, x: number, y: number, c: number[], sc=1): void {
    let cx = x;
    for (const ch of s.toUpperCase()) {
      const g = FONT_5x7[ch] || FONT_5x7[' '];
      for (let gy = 0; gy < 7; gy++) {
        const row = g[gy];
        for (let gx = 0; gx < 5; gx++) if (row & (0x10 >>> gx))
          for (let sy = 0; sy < sc; sy++) for (let sx = 0; sx < sc; sx++)
            this.px(cx + gx*sc + sx, y + gy*sc + sy, ...c);
      }
      cx += 6 * sc;
    }
  }
  tw(s: string, sc=1): number { return s.length * 6 * sc; }
}

// ============================================================
// Palette
// ============================================================
const C = {
  bg: [0x0D,0x0D,0x15], pnl: [0x18,0x1A,0x24],
  mhBg: [0x1A,0x0D,0x0D], mhGold: [0xE8,0xC5,0x47], mhWhite: [0xF0,0xF0,0xF0],
  brd: [0x44,0x4A,0x5C], txt: [0xE8,0xE8,0xE8], txtDim: [0x90,0x98,0xA8], txtGold: [0xE8,0xC5,0x47],
  flR: [0xE8,0x4A,0x2E], flO: [0xF0,0x8C,0x28], flY: [0xF8,0xD0,0x30],
  glBl: [0x38,0x98,0xE8], co2: [0xE0,0x40,0x40],
  srvGy: [0x70,0x78,0x88], srvBl: [0x40,0xA0,0xE0], shGn: [0x40,0xC0,0x70],
  plWh: [0xD0,0xD8,0xE8], plRd: [0xE0,0x40,0x40], clkGd: [0xE8,0xC5,0x47],
};

// ============================================================
// Motifs (each draws at panel center cx, cy)
// ============================================================
function mFlame(c: Canvas, cx: number, cy: number): void {
  for (let i=0;i<6;i++) {
    const h = 24 - i*4, w = 8 + i*2;
    c.rect(cx-w/2, cy-h/2, w, h, i%2?C.flO:C.flR);
  }
  c.rect(cx-2, cy-12, 4, 8, C.flY);
}
function mGlobe(c: Canvas, cx: number, cy: number): void {
  c.circle(cx, cy, 22, C.glBl); c.circle(cx, cy, 18, C.bg);
  c.line(cx-16, cy, cx+16, cy, C.glBl); c.line(cx, cy-16, cx, cy+16, C.glBl);
  c.line(cx-11, cy-11, cx+11, cy+11, C.glBl); c.line(cx-11, cy+11, cx+11, cy-11, C.glBl);
  c.text("CO2", cx-9, cy+32, C.co2);
}
function mServer(c: Canvas, cx: number, cy: number): void {
  const rx = cx-18, ry = cy-20;
  c.rect(rx, ry, 36, 40, C.srvGy);
  for (let i=0;i<5;i++) c.rect(rx+3, ry+3+i*7, 30, 4, C.bg);
  const sx = cx-14, sy = cy-10;
  c.rect(sx, sy, 28, 24, C.shGn); c.rect(sx+2, sy+2, 24, 20, C.srvGy);
  c.line(sx+8, sy+12, sx+12, sy+16, C.shGn); c.line(sx+12, sy+16, sx+18, sy+8, C.shGn);
}
function mPlane(c: Canvas, cx: number, cy: number): void {
  c.rect(cx-20, cy-3, 40, 6, C.plWh); c.rect(cx-12, cy-10, 24, 3, C.plWh);
  c.rect(cx+18, cy-10, 4, 14, C.plWh); c.rect(cx-22, cy-1, 4, 2, C.plRd);
  const kx = cx, ky = cy+18;
  c.circle(kx, ky, 10, C.clkGd); c.line(kx, ky, kx, ky-6, C.clkGd); c.line(kx, ky, kx+5, ky, C.clkGd);
  c.text("DELAY", cx-12, ky+14, C.clkGd);
}

// ============================================================
// Render
// ============================================================
function render(): Canvas {
  const cv = new Canvas();
  cv.rect(0, 0, W, H, C.bg);
  cv.rect(0, 0, W, MH, C.mhBg);
  cv.rect(0, MH-2, W, 2, C.mhGold);
  cv.text("WORLD NEWS", (W - cv.tw("WORLD NEWS",2))/2, 8, C.mhGold, 2);
  cv.text("NOVEMBER 23, 2026", (W - cv.tw("NOVEMBER 23, 2026"))/2, 32, C.mhWhite);
  
  const panels = [
    {x:M, y:SY, cx:M+PW/2, cy:MOTIF_Y, lb:"MIDDLE EAST", h1:"IRAN ATTACKS; US BASES HIT", h2:"HOUTHIS STRIKE SAUDI OIL", mf:mFlame, ac:C.flR},
    {x:P2X, y:SY, cx:P2X+PW/2, cy:MOTIF_Y, lb:"CLIMATE", h1:"COP31 COLLAPSES", h2:"NO FOSSIL FUEL ACCORD", mf:mGlobe, ac:C.co2},
    {x:M, y:SY+M+PH, cx:M+PW/2, cy:MOTIF_Y2, lb:"TECH", h1:"MSFT: AI FLAWS RISK OUTAGES", h2:"TRUMP THREATENS DC TAX", mf:mServer, ac:C.srvBl},
    {x:P2X, y:SY+M+PH, cx:P2X+PW/2, cy:MOTIF_Y2, lb:"AVIATION", h1:"DELTA GLITCH DELAYS FLIGHTS", h2:"AUTOMATION FAILURE", mf:mPlane, ac:C.plRd},
  ];
  for (const p of panels) {
    cv.rect(p.x, p.y, PW, PH, C.pnl);
    cv.frame(p.x, p.y, PW, PH, C.brd);
    cv.rect(p.x+2, p.y+2, PW-4, 3, p.ac);
    cv.text(p.lb, p.x+10, p.y+10, C.txtGold);
    p.mf(cv, p.cx, p.cy);
    const hy = p.y + PH - 42;
    cv.text(p.h1, p.x+10, hy, C.txt);
    cv.text(p.h2, p.x+10, hy+12, C.txtDim);
  }
  return cv;
}

// ============================================================
// Verify
// ============================================================
function find(h: Uint8Array, n: Uint8Array): number {
  for (let i=0;i<=h.length-n.length;i++){let m=true;for(let j=0;j<n.length;j++)if(h[i+j]!==n[j]){m=false;break;}if(m)return i;}return -1;
}

// Proper PNG chunk parser for verification
function parsePNG(png: Uint8Array): Map<string, Uint8Array[]> {
  const chunks = new Map<string, Uint8Array[]>();
  if (png[0]!==0x89||png[1]!==0x50||png[2]!==0x4E||png[3]!==0x47||
      png[4]!==0x0D||png[5]!==0x0A||png[6]!==0x1A||png[7]!==0x0A) {
    throw new Error("Invalid PNG signature");
  }
  let pos = 8;
  while (pos < png.length) {
    if (pos + 8 > png.length) break;
    const len = (png[pos]<<24)|(png[pos+1]<<16)|(png[pos+2]<<8)|png[pos+3];
    const type = new TextDecoder().decode(png.slice(pos+4, pos+8));
    if (pos + 8 + len + 4 > png.length) break;
    const data = png.slice(pos+8, pos+8+len);
    if (!chunks.has(type)) chunks.set(type, []);
    chunks.get(type)!.push(data);
    pos += 12 + len; // length(4) + type(4) + data(len) + crc(4)
  }
  return chunks;
}

// Font round-trip self-test
function testFontRoundTrip(): void {
  console.log("\n=== FONT ROUND-TRIP SELF-TEST ===");
  
  // Build reverse lookup
  const REVERSE_FONT = new Map<string, string>();
  for (const [ch, bits] of Object.entries(FONT_5x7)) {
    const key = bits.join(',');
    REVERSE_FONT.set(key, ch);
  }
  
  const TEST_STRINGS = [
    "WORLD NEWS",
    "NOVEMBER 23, 2026",
    "MIDDLE EAST",
    "CLIMATE",
    "TECH",
    "AVIATION",
    "IRAN ATTACKS; US BASES HIT",
    "HOUTHIS STRIKE SAUDI OIL",
    "COP31 COLLAPSES",
    "NO FOSSIL FUEL ACCORD",
    "MSFT: AI FLAWS RISK OUTAGES",
    "TRUMP THREATENS DC TAX",
    "DELTA GLITCH DELAYS FLIGHTS",
    "AUTOMATION FAILURE",
    "DELAY",
  ];
  
  function renderString(str: string, scale: number = 1): number[][] {
    const width = str.length * 6 * scale;
    const height = 7 * scale;
    const bmp: number[][] = Array(height).fill(0).map(() => Array(width).fill(0));
    
    let x = 0;
    for (const ch of str) {
      const bits = FONT_5x7[ch];
      if (!bits) { x += 6 * scale; continue; }
      for (let row = 0; row < 7; row++) {
        const byte = bits[row];
        for (let col = 0; col < 5; col++) {
          if (byte & (0x10 >>> col)) {
            for (let sy = 0; sy < scale; sy++) {
              for (let sx = 0; sx < scale; sx++) {
                bmp[row * scale + sy][x + col * scale + sx] = 1;
              }
            }
          }
        }
      }
      x += 6 * scale;
    }
    return bmp;
  }
  
  function decodeBitmap(bmp: number[][], scale: number = 1): string {
    const height = bmp.length;
    const width = bmp[0].length;
    let result = "";
    let x = 0;
    
    while (x < width) {
      const cell: number[] = [];
      for (let row = 0; row < 7; row++) {
        let byte = 0;
        for (let col = 0; col < 5; col++) {
          const sy = row * scale + Math.floor(scale/2);
          const sx = x + col * scale + Math.floor(scale/2);
          if (sy < height && sx < width && bmp[sy][sx]) {
            byte |= (0x10 >>> col);
          }
        }
        cell.push(byte);
      }
      const key = cell.join(',');
      const ch = REVERSE_FONT.get(key) || '?';
      result += ch;
      x += 6 * scale;
    }
    return result;
  }
  
  let allPassed = true;
  for (const str of TEST_STRINGS) {
    const rendered = renderString(str, 1);
    const decoded = decodeBitmap(rendered, 1);
    const passed = str === decoded;
    console.log(`  ${passed ? '✓' : '✗'} "${str}" -> "${decoded}"`);
    if (!passed) allPassed = false;
  }
  console.log(`  ${allPassed ? 'ALL PASSED' : 'SOME FAILED'}`);
  if (!allPassed) throw new Error("Font round-trip test failed");
}

function verify(png: Uint8Array, cv: Canvas): void {
  console.log("=== VERIFICATION ===");
  console.log(`PNG bytes: ${png.length}`); assert(png.length > 1000, "PNG size");
  
  // Parse PNG properly
  const chunks = parsePNG(png);
  
  const ihdrData = chunks.get('IHDR')?.[0];
  assert(ihdrData && ihdrData.length === 13, "IHDR");
  const w = (ihdrData[0]<<24)|(ihdrData[1]<<16)|(ihdrData[2]<<8)|ihdrData[3];
  const h = (ihdrData[4]<<24)|(ihdrData[5]<<16)|(ihdrData[6]<<8)|ihdrData[7];
  console.log(`${w}x${h}`); assert(w===512&&h===512, "512x512");
  
  // Verify PNG is decodable by zlib (IDAT chunk)
  const idatChunks = chunks.get('IDAT');
  assert(idatChunks && idatChunks.length > 0, "IDAT");
  const { inflateSync } = require('node:zlib');
  try {
    inflateSync(idatChunks[0]);
    console.log("IDAT: zlib decode OK");
  } catch (e) {
    console.error("IDAT: zlib decode FAILED", e);
    throw new Error("IDAT zlib decode failed");
  }
  
  // Verify masthead gold text - "WORLD NEWS" at scale 2 starts at x=196, y=8, height=14
  // Check at y=8 (top row of text) which has solid gold pixels
  let goldCount = 0;
  for (let y = 8; y < 22; y++) {
    for (let x = 196; x < 316; x++) {
      const p = cv.get(x, y);
      if (p[0]>200 && p[1]>180 && p[2]<100) goldCount++;
    }
  }
  console.log(`Masthead gold pixels: ${goldCount}`);
  assert(goldCount > 100, "gold text");
  
  for (const [x,y,d] of [[M,SY,"TL"],[P2X,SY,"TR"],[M,SY+PH-1,"BL"],[P2X,SY+PH-1,"BR"]]) {
    const p=cv.get(x,y); const b=p[0]>60&&p[0]<80&&p[1]>70&&p[1]<90&&p[2]>80&&p[2]<100;
    console.log(`Border ${d}(${x},${y}): ${b} ${p.join(',')}`); assert(b, `border ${d}`);
  }
  
  for (const r of [
    {x:26,y:SY+10,w:80,h:14,n:"MIDDLE EAST"},
    {x:P2X+10,y:SY+10,w:60,h:14,n:"CLIMATE"},
    {x:26,y:SY+PH+M+10,w:40,h:14,n:"TECH"},
    {x:P2X+10,y:SY+PH+M+10,w:70,h:14,n:"AVIATION"},
  ]) {
    let bc=0; for(let yy=r.y;yy<r.y+r.h;yy++)for(let xx=r.x;xx<r.x+r.w;xx++)if((cv.get(xx,yy).reduce((a,b)=>a+b,0)/3)>100)bc++;
    console.log(`Label ${r.n}: ${bc}px`); assert(bc>50, `label ${r.n}`);
  }
  
  // Check distinct colors: bg, masthead bg, panel, text
  const pBg = cv.get(0,0);           // dark blue bg
  const pMhBg = cv.get(10,10);       // dark red masthead bg
  const pPanel = cv.get(50, 100);    // panel bg
  const pLabel = cv.get(30, SY+10);  // gold label
  
  const diff = 
    Math.abs(pBg[0]-pMhBg[0])+Math.abs(pBg[1]-pMhBg[1])+Math.abs(pBg[2]-pMhBg[2])+
    Math.abs(pBg[0]-pPanel[0])+Math.abs(pBg[1]-pPanel[1])+Math.abs(pBg[2]-pPanel[2])+
    Math.abs(pBg[0]-pLabel[0])+Math.abs(pBg[1]-pLabel[1])+Math.abs(pBg[2]-pLabel[2])+
    Math.abs(pMhBg[0]-pPanel[0])+Math.abs(pMhBg[1]-pPanel[1])+Math.abs(pMhBg[2]-pPanel[2])+
    Math.abs(pMhBg[0]-pLabel[0])+Math.abs(pMhBg[1]-pLabel[1])+Math.abs(pMhBg[2]-pLabel[2])+
    Math.abs(pPanel[0]-pLabel[0])+Math.abs(pPanel[1]-pLabel[1])+Math.abs(pPanel[2]-pLabel[2]);
  console.log(`Color diff: ${diff} (bg:${pBg.join(',')} mhBg:${pMhBg.join(',')} panel:${pPanel.join(',')} label:${pLabel.join(',')})`);
  assert(diff>100, "non-uniform");
  assert(cv.d.length===W*H*3, "canvas size");
  console.log("=== ALL ASSERTIONS PASSED ===");
}
function assert(c: boolean, m: string): void { if(!c){console.error(`ASSERTION FAILED: ${m}`);process.exit(1);} }

// ============================================================
// Main
// ============================================================
const cv = render();
const png = createPNG(cv.d);
testFontRoundTrip();
verify(png,cv);
const {writeFileSync,mkdirSync}=require('node:fs'),{join}=require('node:path');
const out=process.env.MAKEFUN_OUTPUT_DIR??'/output'; mkdirSync(out,{recursive:true});
writeFileSync(join(out,'entry.png'),png);
console.log(`Written to ${join(out,'entry.png')}`);
