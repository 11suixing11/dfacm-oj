self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch (error) {}
    try { await self.registration.unregister(); } catch (error) {}
    try { await self.clients.claim(); } catch (error) {}
  })());
});
