// ---------------------------------------------------------------------------
//  L'URL DU RELAIS — le seul point commun des trois fonctionnalités IA.
//
//  L'application ne parle qu'au RELAIS (`news/worker.js`), jamais à Google News
//  ni à Gemini. Deux raisons, toutes deux dirimantes :
//   · le flux RSS de Google News ne renvoie aucun en-tête CORS — un navigateur ne
//     peut pas l'appeler, quoi qu'on écrive ici ;
//   · une clé Gemini livrée dans le bundle serait publique, donc utilisable (et
//     facturable) par n'importe quel visiteur.
//  Même schéma que le connecteur HubSpot : un relais déployé une fois par l'éditeur,
//  dont l'URL est publiée dans l'application.
//
//  ⚠️ CE FICHIER A MAIGRI. Il portait aussi « les actualités » — une recherche de
//  dépêches qu'il fallait ensuite faire analyser d'un second clic. C'était la moitié
//  d'une fonctionnalité : ce que le commercial veut savoir, c'est s'il y a une raison
//  d'appeler, pas ce que la presse a publié. Tout est passé dans `signals.js`, qui va
//  jusqu'au bout et range les dépêches parmi ses preuves. Le nom du module reste, parce
//  que la clé de configuration publiée (`integrations.news.relayUrl`) est en service
//  chez des clients : la renommer ferait disparaître leur relais sans rien améliorer.
// ---------------------------------------------------------------------------

export const newsRelayUrl = (db) => String(db?.integrations?.news?.relayUrl || '').replace(/\/+$/, '')
