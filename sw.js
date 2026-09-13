/* 웨이하이 가족여행 — 오프라인 서비스워커
   버전을 올리면 캐시가 갱신됩니다. */
const VERSION = 'weihai-white-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './manifest.webmanifest?v=white-2',
  './assets/styles.css',
  './assets/styles.css?v=white-2',
  './assets/app.js?v=white-2',
  './assets/app.js',
  './assets/data.js',
  './assets/icon.svg',
  './assets/icon.svg?v=white-2',
  './assets/icon-192.png',
  './assets/icon-192.png?v=white-2',
  './assets/icon-512.png?v=white-2',
  './assets/icon-512.png',
  './assets/icon-maskable.png?v=white-2',
  './assets/icon-maskable.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;      // 외부 요청은 그대로 통과

  // 문서 요청: 네트워크 우선 → 실패 시 캐시 (오프라인 대응)
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // 그 외 정적 자원: 캐시 우선 + 백그라운드 갱신
  e.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
