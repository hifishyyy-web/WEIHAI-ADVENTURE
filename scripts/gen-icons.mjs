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

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const over = (dst, src, alpha) => dst.map((v, i) => v * (1 - alpha) + src[i] * alpha);
const clamp01 = v => Math.max(0, Math.min(1, v));
/* 안티에일리어싱: 부호거리(양수=내부)를 0~1 커버리지로 */
const cov = d => clamp01(d + 0.5);

const TOP = [11, 42, 61], MID = [15, 95, 135], BOT = [23, 137, 189];
const SUN = [244, 201, 93], WHITE = [255, 255, 255];

function render(size, { radius, inset }) {
  const buf = Buffer.alloc(size * size * 4);
  const S = size, R = radius * S, IN = inset * S, W = S - IN * 2;
  const sunCX = IN + W * 0.5, sunCY = IN + W * 0.371, sunR = W * 0.1133;
  const waves = [
    { y: 0.645, amp: 0.058, a: 0.16 },
    { y: 0.727, amp: 0.058, a: 0.26 },
    { y: 0.812, amp: 0.058, a: 0.42 }
  ];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      // 라운드 사각형 마스크(배경 영역)
      const px = x + 0.5, py = y + 0.5;
      const qx = Math.max(Math.abs(px - S / 2) - (W / 2 - R), 0);
      const qy = Math.max(Math.abs(py - S / 2) - (W / 2 - R), 0);
      const inner = Math.max(Math.abs(px - S / 2) - (W / 2 - R), Math.abs(py - S / 2) - (W / 2 - R));
      const dist = inner <= 0
        ? Math.max(Math.abs(px - S / 2) - W / 2, Math.abs(py - S / 2) - W / 2)
        : Math.hypot(qx, qy) - R;
      const mask = cov(-dist);
      if (mask <= 0) { buf[i + 3] = 0; continue; }

      // 세로 그라디언트
      const t = clamp01((py - IN) / W);
      let c = t < 0.55 ? mix(TOP, MID, t / 0.55) : mix(MID, BOT, (t - 0.55) / 0.45);

      // 태양
      const ds = sunR - Math.hypot(px - sunCX, py - sunCY);
      c = over(c, SUN, cov(ds));

      // 파도(사인파 아래쪽을 흰색 반투명으로)
      for (const w of waves) {
        const baseY = IN + W * w.y + Math.sin((px - IN) / W * Math.PI * 2 - 0.6) * (W * w.amp * 0.35);
        c = over(c, WHITE, cov(py - baseY) * w.a);
      }

      buf[i] = Math.round(c[0]); buf[i + 1] = Math.round(c[1]);
      buf[i + 2] = Math.round(c[2]); buf[i + 3] = Math.round(mask * 255);
    }
  }
  return png(S, S, buf);
}

writeFileSync('assets/icon-192.png', render(192, { radius: 0.22, inset: 0 }));
writeFileSync('assets/icon-512.png', render(512, { radius: 0.22, inset: 0 }));
/* maskable: OS가 자체 마스크를 씌우므로 모서리까지 꽉 채운 정사각형 */
writeFileSync('assets/icon-maskable.png', render(512, { radius: 0.02, inset: 0.0 }));
console.log('icons written');
