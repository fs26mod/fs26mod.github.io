/* FS26 MOD - büyük dosyaları belleğe/blob'a bağlamadan doğrudan diske akıtan indirme Service Worker'ı.
   index.html ile AYNI klasöre (sitenin köküne) koy. */
const pending = new Map();   // id -> { name, size, stream }

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'fsdl') {
    pending.set(d.id, { name: d.name, size: d.size, stream: d.stream });
    setTimeout(() => pending.delete(d.id), 120000);
    if (e.ports && e.ports[0]) e.ports[0].postMessage(1);   // onay
  }
  /* d.type === 'ping': yalnızca Service Worker'ı canlı tutar */
});

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url), i = u.pathname.indexOf('/__fsdl/');
  if (i < 0) return;
  const id = u.pathname.slice(i + 8), it = pending.get(id);
  if (!it) { e.respondWith(new Response('Bulunamadı', { status: 404 })); return; }
  pending.delete(id);
  const h = new Headers({
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(it.name),
    'Content-Length': String(it.size),
    'Cache-Control': 'no-store'
  });
  e.respondWith(new Response(it.stream, { headers: h }));
});
