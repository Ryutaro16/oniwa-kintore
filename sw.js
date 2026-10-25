/* オフラインでも開けるようにする（ジムで電波が弱いとき用）。
   まずネットから最新を取りに行き、3秒で取れなければ保存しておいた版を使う */
const CACHE = 'kintore-20261025215410';
const FILES = ['./', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  const net = fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  });
  const slow = new Promise((res) => setTimeout(res, 3000)).then(() => caches.match(e.request, { ignoreSearch: true }));
  e.respondWith(Promise.race([net, slow.then((c) => c || net)]).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
