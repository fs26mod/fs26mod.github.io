/* Büyük indirmeleri belleğe/blob'a sığdırmadan doğrudan akıtır. Başka hiçbir isteğe karışmaz. */
const jobs = new Map();
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || d.type !== 'fsdl') return;          // 'ping' gibi mesajlar sadece servis işçisini uyanık tutar
  jobs.set(d.id, d);
  if (e.ports && e.ports[0]) e.ports[0].postMessage(true);
  setTimeout(() => jobs.delete(d.id), 120000);
});
self.addEventListener('fetch', (e) => {
  const m = new URL(e.request.url).pathname.match(/\/__fsdl\/([\w-]+)$/);
  if (!m) return;
  const job = jobs.get(m[1]);
  if (!job) return;
  jobs.delete(m[1]);
  const fn = encodeURIComponent(job.name).replace(/['()]/g, escape);
  e.respondWith(new Response(job.stream, { headers: {
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(job.size),
    'Content-Disposition': "attachment; filename*=UTF-8''" + fn,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  } }));
});
