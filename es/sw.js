// Service worker : réseau d'abord pour la page (les mises à jour arrivent immédiatement),
// cache en secours pour le hors-ligne.
// ⚠️ CHANGER CE NOM PURGE LES ANCIENNES VERSIONS. L'`activate` supprime toute clé de
// cache différente de celle-ci : c'est le seul levier qui garantit qu'un navigateur
// cesse de servir un bundle périmé. À incrémenter dès qu'une version livrée doit
// remplacer la précédente sans attendre — typiquement après un correctif de sécurité,
// où continuer à servir l'ancien fichier revient à ne pas avoir corrigé.
// v4 : le bundle v3 portait encore l identifiant env-peoplespheres en clair.
// v3 : le bundle v2 contenait encore le code PIN de démarrage en clair et deux
// identifiants nommant le fondateur. Il ne doit plus être servi à personne.
const CACHE = 'bdrflow-v4'

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
