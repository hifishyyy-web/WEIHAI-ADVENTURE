/* 아이콘 PNG 생성기 — 외부 의존성 없이 zlib만 사용.
   실행: node scripts/gen-icons.mjs   (assets/icon-*.png 재생성) */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = buf => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const png = (w, h, rgba) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
};

// The same typographic W as icon.svg, on a solid white background.
const points = [[142,174],[185,338],[256,213],[327,338],[370,174]];
const distanceToSegment = (x,y,a,b) => {
  const dx=b[0]-a[0], dy=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));
  return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);
};
function render(size) {
  const buf=Buffer.alloc(size*size*4,255);
  const scale=size/512;
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    let d=Infinity;
    for(let n=1;n<points.length;n++) {
      d=Math.min(d,distanceToSegment((x+.5)/scale,(y+.5)/scale,points[n-1],points[n]));
    }
    const coverage=Math.max(0,Math.min(1,(16-d)*scale+.5));
    const shade=Math.round(255*(1-coverage));
    const i=(y*size+x)*4;
    buf[i]=buf[i+1]=buf[i+2]=shade;
  }
  return png(size,size,buf);
}
writeFileSync('assets/icon-192.png',render(192));
writeFileSync('assets/icon-512.png',render(512));
// The W remains inside the maskable icon's central safe area.
writeFileSync('assets/icon-maskable.png',render(512));
console.log('White icons written');
