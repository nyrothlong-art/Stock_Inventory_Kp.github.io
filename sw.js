const VERSION = 'stock-pro-v2';
const CORE = [
  './', './index.html', './manifest.json', './icon-192.png', './icon-512.png',
  './css/style.css',
  './js/tailwind-config.js', './js/app.js', './js/features.js',
  './js/firebase-sync.js', './js/register-sw.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Hosts that must never be cached (live data / auth / alerts)
const BYPASS = ['firebaseio.com', 'firebasedatabase.app', 'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com', 'api.telegram.org', 'api.web3forms.com', 'googleapis.com/identitytoolkit'];

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (BYPASS.some(h => url.href.includes(h))) return;

  // Stale-while-revalidate for app shell + CDN libraries/fonts
  e.respondWith(
    caches.open(VERSION).then(async cache => {
      const cached = await cache.match(req, { ignoreSearch: false });
      const network = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => cached || (req.mode === 'navigate' ? cache.match('./index.html') : undefined));
      return cached || network;
    })
  );
});
