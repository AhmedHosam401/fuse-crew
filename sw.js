// Service worker: makes the app installable and lets it open offline (one-phone mode works with no internet).
// Bump CACHE whenever you deploy a new version so phones pick up the update.
// js/world3d.js (+ world-art.js, world-modules.js, world-book.js) and vendor/ are NOT listed: only phones that pick the 3D view download them (once); the
// fetch handler below then keeps them cached like everything else.
const CACHE = 'fuse-v15';
const ASSETS = [
  './', 'index.html', 'style.css', 'firebase-config.js', 'rtc-config.js', 'manifest.webmanifest',
  'fonts/cairo-arabic-wght-normal.woff2', 'fonts/cairo-latin-wght-normal.woff2',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'js/app.js', 'js/engine.js', 'js/senses.js', 'js/account.js', 'js/social.js', 'js/scene.js', 'js/i18n.js', 'js/net.js', 'js/screens.js', 'js/ui.js', 'js/voice.js',
];

self.addEventListener('install', (e) => {
  // cache:'reload' = straight from the server, never from the browser's own HTTP cache (GitHub Pages keeps files for 10 minutes), so a new version never installs old files
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Same-origin files: serve from cache instantly, refresh in the background. Firebase traffic is never touched.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined));
      return hit || net;
    }),
  );
});
