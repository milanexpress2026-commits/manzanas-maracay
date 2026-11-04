const CACHE='mm-offline-v1';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.add('/offline.html')));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('mm-offline-')&&key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim();});
// Never cache business records or queue writes. An offline fallback cannot pretend to save data.
self.addEventListener('fetch',event=>{if(event.request.mode==='navigate'&&event.request.method==='GET')event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));});
