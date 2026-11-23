/**
 * News Collage Generator - 23 November 2026
 * Generates a 512x512 PNG via Node stdlib only (zlib + CRC32)
 * Refactored v2: cleaner structure, improved motifs, better text layout
 */

// ============================================================
// 5x7 Bitmap Font (uppercase A-Z, 0-9, punctuation, space)
// Each char: 5 wide x 7 high, 1-bit per pixel (MSB first)
// ============================================================
const FONT_5x7: Record<string, number[]> = {
  'A': [0x1E, 0x33, 0x33, 0x3F, 0x33, 0x33, 0x33],
  'B': [0x1F, 0x33, 0x33, 0x1F, 0x33, 0x33, 0x1F],
  'C': [0x1E, 0x33, 0x20, 0x20, 0x20, 0x33, 0x1E],
  'D': [0x1F, 0x33, 0x33, 0x33, 0x33, 0x33, 0x1F],
  'E': [0x3F, 0x20, 0x20, 0x1F, 0x20, 0x20, 0x3F],
  'F': [0x3F, 0x20, 0x20, 0x1F, 0x20, 0x20, 0x20],
  'G': [0x1E, 0x33, 0x20, 0x27, 0x23, 0x33, 0x1E],
  'H': [0x33, 0x33, 0x33, 0x3F, 0x33, 0x33, 0x33],
  'I': [0x3E, 0x08, 0x08, 0x08, 0x08, 0x08, 0x3E],
  'J': [0x1C, 0x0C, 0x0C, 0x0C, 0x0C, 0x3C, 0x18],
  'K': [0x33, 0x36, 0x3C, 0x38, 0x3C, 0x36, 0x33],
  'L': [0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x3F],
  'M': [0x63, 0x77, 0x7F, 0x6B, 0x63, 0x63, 0x63],
  'N': [0x33, 0x33, 0x39, 0x3D, 0x33, 0x33, 0x33],
  'O': [0x1E, 0x33, 0x33, 0x33, 0x33, 0x33, 0x1E],
  'P': [0x1F, 0x33, 0x33, 0x1F, 0x20, 0x20, 0x20],
  'Q': [0x1E, 0x33, 0x33, 0x33, 0x3B, 0x36, 0x1E],
  'R': [0x1F, 0x33, 0x33, 0x1F, 0x3C, 0x36, 0x33],
  'S': [0x1E, 0x33, 0x20, 0x1E, 0x03, 0x33, 0x1E],
  'T': [0x3F, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08],
  'U': [0x33, 0x33, 0x33, 0x33, 0x33, 0x33, 0x1E],
  'V': [0x63, 0x63, 0x63, 0x63, 0x63, 0x36, 0x1C],
  'W': [0x63, 0x63, 0x63, 0x6B, 0x7F, 0x77, 0x63],
  'X': [0x63, 0x63, 0x36, 0x1C, 0x36, 0x63, 0x63],
  'Y': [0x63, 0x63, 0x63, 0x36, 0x1C, 0x1C, 0x1C],
  'Z': [0x3F, 0x03, 0x06, 0x0C, 0x18, 0x30, 0x3F],
  '0': [0x1E, 0x33, 0x37, 0x3B, 0x3D, 0x33, 0x1E],
  '1': [0x0C, 0x1C, 0x0C, 0x0C, 0x0C, 0x0C, 0x3E],
  '2': [0x1E, 0x33, 0x03, 0x06, 0x0C, 0x18, 0x3F],
  '3': [0x1E, 0x33, 0x03, 0x0E, 0x03, 0x33, 0x1E],
  '4': [0x06, 0x0E, 0x1E, 0x36, 0x3F, 0x06, 0x06],
  '5': [0x3F, 0x30, 0x30, 0x1E, 0x03, 0x33, 0x1E],
  '6': [0x0E, 0x18, 0x30, 0x3E, 0x33, 0x33, 0x1E],
  '7': [0x3F, 0x03, 0x06, 0x0C, 0x18, 0x18, 0x18],
  '8': [0x1E, 0x33, 0x33, 0x1E, 0x33, 0x33, 0x1E],
  '9': [0x1E, 0x33, 0x33, 0x1F, 0x03, 0x06, 0x0C],
  ':': [0x00, 0x18, 0x18, 0x00, 0x00, 0x18, 0x18],
  '-': [0x00, 0x00, 0x00, 0x1C, 0x00, 0x00, 0x00],
  ',': [0x00, 0x00, 0x00, 0x00, 0x18, 0x18, 0x10],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x18, 0x18],
  '\'': [0x00, 0x18, 0x18, 0x00, 0x00, 0x00, 0x00],
  ' ': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
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
  const { deflateRawSync } = require('node:zlib');
  const raw = new Uint8Array(H * (W * 3 + 1));
  let p = 0;
  for (let y = 0; y < H; y++) { raw[p++] = 0; raw.set(img.subarray(y*W*3, y*W*3+W*3), p); p += W*3; }
  chunk(cs, 'IDAT', deflateRawSync(raw));
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
    const i = (y * W + x) * 3; this.d[i] = r; this.d[i+1] = g; this.d[i+2] = b;
  }
  get(x: number, y: number): [number,number,number] {
    if (x < 0 || x >= W || y < 0 || y >= H) return [0,0,0];
    const i = (y * W + x) * 3; return [this.d[i], this.d[i+1], this.d[i+2]];
  }
  rect(x: number, y: number, w: number, h: number, c: number[]): void {
    for (let yy = y; yy < y+h; yy++) for (let xx = x; xx < x+w; xx++) this.px(xx, yy, c[0], c[1], c[2]);
  }
  frame(x: number, y: number, w: number, h: number, c: number[]): void {
    for (let xx = x; xx < x+w; xx++) { this.px(xx, y, ...c); this.px(xx, y+h-1, ...c); }
    for (let yy = y; yy < y+h; yy++) { this.px(x, yy, ...c); this.px(x+w-1, yy, ...c); }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number[]): void {
    let dx = Math.abs(x1-x0), dy = Math.abs(y1-y0), sx = x0<x1?1:-1, sy = y0<y1?1:-1, err = dx-dy, x=x0, y=y0;
    while (true) { this.px(x, y, ...c); if (x===x1&&y===y1) break; const e2=2*err; if (e2>-dy){err-=dy;x+=sx;} if (e2<dx){err+=dx;y+=sy;} }
  }
  circle(cx: number, cy: number, r: number, c: number[], fill=false): void {
    if (fill) { for (let y=-r; y<=r; y++) { const dx=Math.floor(Math.sqrt(r*r-y*y)); for (let x=-dx; x<=dx; x++) this.px(cx+x,cy+y,...c); } }
    else { let x=r, y=0, e=0; while (x>=y) { this.px(cx+x,cy+y,...c); this.px(cx+y,cy+x,...c); this.px(cx-y,cy+x,...c); this.px(cx-x,cy+y,...c); this.px(cx-x,cy-y,...c); this.px(cx-y,cy-x,...c); this.px(cx+y,cy-x,...c); this.px(cx+x,cy-y,...c); y++; e+=2*y+1; if (2*(e-x)+1>0){x--;e+=1-2*x;} } }
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
  for (let i = 0; i < 5; i++) c.rect(cx - 6 + i, cy - i*6, 12 - i*2, 6, C.flR);
  for (let i = 0; i < 4; i++) c.rect(cx - 4 + i, cy - i*6 - 1, 8 - i*1.5, 4, C.flO);
  c.rect(cx-2, cy-20, 4, 4, C.flY); c.rect(cx+8, cy-14, 3, 4, C.flO); c.rect(cx-11, cy-10, 3, 4, C.flO);
}
function mGlobe(c: Canvas, cx: number, cy: number): void {
  c.circle(cx, cy, 22, C.glBl); c.circle(cx, cy, 21, C.glBl);
  for (let a = 0; a < Math.PI*2; a += Math.PI/6) {
    const s = Math.round(a/(Math.PI/6))%12; if (![1,4,7].includes(s))
      c.line(Math.round(cx+Math.cos(a)*25), Math.round(cy+Math.sin(a)*25),
             Math.round(cx+Math.cos(a)*31), Math.round(cy+Math.sin(a)*31), C.co2);
  }
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
function verify(png: Uint8Array, cv: Canvas): void {
  console.log("=== VERIFICATION ===");
  console.log(`PNG bytes: ${png.length}`); assert(png.length > 1000, "PNG size");
  const ihdr = find(png, new TextEncoder().encode('IHDR'));
  console.log(`IHDR at ${ihdr}`); assert(ihdr > 0, "IHDR");
  const w = (png[ihdr+4]<<24)|(png[ihdr+5]<<16)|(png[ihdr+6]<<8)|png[ihdr+7];
  const h = (png[ihdr+8]<<24)|(png[ihdr+9]<<16)|(png[ihdr+10]<<8)|png[ihdr+11];
  console.log(`${w}x${h}`); assert(w===512&&h===512, "512x512");
  
  const g1 = cv.get(200,10), g2 = cv.get(250,10);
  const gold = (g1[0]>200&&g1[1]>180&&g1[2]<100) || (g2[0]>200&&g2[1]>180&&g2[2]<100);
  console.log(`Masthead gold: ${gold} (${g1.join(',')})/(${g2.join(',')})`); assert(gold, "gold text");
  
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
  
  const pG=cv.get(250,10), pD=cv.get(0,0), pP=cv.get(100,100);
  const diff=Math.abs(pG[0]-pD[0])+Math.abs(pG[1]-pD[1])+Math.abs(pG[2]-pD[2])+
             Math.abs(pG[0]-pP[0])+Math.abs(pG[1]-pP[1])+Math.abs(pG[2]-pP[2])+
             Math.abs(pD[0]-pP[0])+Math.abs(pD[1]-pP[1])+Math.abs(pD[2]-pP[2]);
  console.log(`Color diff: ${diff}`); assert(diff>100, "non-uniform");
  assert(cv.d.length===W*H*3, "canvas size");
  console.log("=== ALL ASSERTIONS PASSED ===");
}
function assert(c: boolean, m: string): void { if(!c){console.error(`ASSERTION FAILED: ${m}`);process.exit(1);} }

// ============================================================
// Main
// ============================================================
const cv = render();
const png = createPNG(cv.d);
const {writeFileSync,mkdirSync}=require('node:fs'),{join}=require('node:path');
const out=process.env.MAKEFUN_OUTPUT_DIR??'/output'; mkdirSync(out,{recursive:true});
writeFileSync(join(out,'entry.png'),png);
verify(png,cv);
console.log(`Written to ${join(out,'entry.png')}`);
