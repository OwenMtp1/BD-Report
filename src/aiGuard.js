// ---------------------------------------------------------------------------
//  UN APPEL DEMANDÉ = UN APPEL ENVOYÉ.
//
//  Mesuré : un seul clic produisait DEUX appels au relais, donc deux appels Gemini.
//  Deux causes qui se cumulent, et une seule parade :
//   · le panneau déclenche sa recherche au MONTAGE, et il se remonte (React en mode
//     strict double les effets ; la fiche entreprise se remonte aussi quand l'URL
//     partageable change) ;
//   · rien n'empêchait deux demandes identiques de partir en même temps.
//  Une demande en cours est donc PARTAGÉE : la seconde attend la première au lieu
//  d'en lancer une seconde. C'est ce qui faisait atteindre le quota gratuit en
//  quelques clics — pas le volume d'utilisation.
//
//  Et quand Google dit « trop de requêtes », on le retient : inutile de redemander
//  avant l'heure qu'il a lui-même indiquée.
// ---------------------------------------------------------------------------
// ⚠️ UN COMPTEUR PAR FONCTIONNALITÉ, pas un pour tout le monde. Les deux actions IA ne
// se heurtent pas à la même limite : l'enrichissement passe par la recherche Google, dont
// le quota gratuit est bien plus serré que celui du texte. Avec une seule clé d'attente,
// un enrichissement refusé mettait AUSSI les signaux au repos — alors que leur quota était
// intact. L'utilisateur voyait une fonctionnalité s'éteindre sans l'avoir touchée.
const COOLDOWN_KEY = 'bdrflow_ai_cooldown_v1'
const keyFor = (scope) => COOLDOWN_KEY + (scope ? ':' + scope : '')
const inflight = new Map()

/** Partage une demande identique déjà en vol, au lieu d'en lancer une seconde. */
export function once(key, fn) {
  if (inflight.has(key)) return inflight.get(key)
  const p = Promise.resolve()
    .then(fn)
    .finally(() => { inflight.delete(key) })
  inflight.set(key, p)
  return p
}

/** Secondes restantes avant de pouvoir rappeler l'IA pour CETTE fonctionnalité, 0 si libre. */
export function cooldownLeft(scope) {
  try {
    const until = Number(localStorage.getItem(keyFor(scope))) || 0
    return Math.max(0, Math.ceil((until - Date.now()) / 1000))
  } catch (e) { return 0 }
}

export function startCooldown(seconds, scope) {
  try { localStorage.setItem(keyFor(scope), String(Date.now() + Math.max(5, Number(seconds) || 60) * 1000)) } catch (e) { /* quota */ }
}

export const quotaMessage = (left) => left
  ? `Quota Google atteint. Réessayez dans ${left} seconde${left > 1 ? 's' : ''}.`
  : 'Quota Google atteint. Réessayez dans un instant.'
