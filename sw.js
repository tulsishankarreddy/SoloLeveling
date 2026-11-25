/* Service worker: offline support + background quest reminders. */
const VERSION = 'system-v2';
const CORE = ['./', 'index.html', 'styles.css', 'app.js', 'cloud.js', 'config.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== VERSION && k !== 'system-status').map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

// Stale-while-revalidate: instant load from cache, refresh in the background.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Only cache the app itself and its fonts. Google sign-in, Drive and Calendar must always go to the network.
  const url = new URL(req.url);
  const mine = url.origin === self.location.origin && !url.pathname.endsWith('status.json');
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!mine && !fonts) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    const network = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => cached || (req.mode === 'navigate' ? cache.match('index.html') : undefined));
    return cached || network;
  }));
});

const localKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function questCheck() {
  const c = await caches.open('system-status');
  const r = await c.match('status.json');
  if (!r) return;
  const s = await r.json();
  if (!s.notify) return;
  const now = new Date();
  if (s.date === localKey(now) && s.done) return;
  const first = (s.times && s.times[0]) || '20:00';
  const [h, m] = first.split(':').map(Number);
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
  await self.registration.showNotification('[Daily Quest] Not complete', {
    body: 'Finish today\'s Daily Quest before midnight, or face the penalty.',
    icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'daily-quest',
  });
}

self.addEventListener('periodicsync', e => {
  if (e.tag === 'quest-check') e.waitUntil(questCheck());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  }));
});
