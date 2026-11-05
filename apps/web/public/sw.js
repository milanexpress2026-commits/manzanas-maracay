const CACHE = 'mm-offline-v4';
const LOGO = '/brand/logo-manzanas-maracay.webp';
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['/offline.html', LOGO])));
  self.skipWaiting();
});
// Only a generic reminder reaches the lock screen. Operational data is never cached here.
self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification('Manzanas Maracay', {
      body: 'Tienes recordatorios de cobranza para revisar en la aplicación.',
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-64.png',
      tag: 'manzanas-cobranza',
      data: { url: '/cobranza' },
    }),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL('/cobranza', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const current = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (current) {
        await current.navigate(target);
        return current.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('mm-offline-') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});
// Only the offline page and official logo are cached. Never cache records or queue writes.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname === LOGO) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => (await cache.match(LOGO)) || fetch(event.request)),
    );
  } else if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
  }
});
