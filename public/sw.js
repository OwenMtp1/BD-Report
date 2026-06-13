// Service worker : réseau d'abord pour la page (les mises à jour arrivent immédiatement),
// cache en secours pour le hors-ligne.
const CACHE = 'bdrflow-v2'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./'])).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  // Pages HTML : réseau d'abord (version toujours fraîche), cache si hors-ligne.
  if (e.request.mode === 'navigate' || (e.request.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone())).catch(() => {})
        return res
      }).catch(() => caches.match(e.request))
    )
    return
  }
  // Assets : cache d'abord avec mise à jour en arrière-plan.
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
