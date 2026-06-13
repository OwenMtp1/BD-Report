// Service worker : cache-first avec mise à jour en arrière-plan (l'app fonctionne hors-ligne).
const CACHE = 'bdrflow-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./'])).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fresh = fetch(e.request).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone())).catch(() => {})
        return res.clone()
      }).catch(() => cached)
      return cached || fresh
    })
  )
})
