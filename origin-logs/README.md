# Origin Roleplay — Journal serveur

Panneau de logs pour serveur GTA RP (FiveM). Page autonome, sans build ni
dépendance : un seul fichier HTML, tout le rendu et tout l'état vivent dans
le navigateur.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `panel.html` | **La source.** Format Artifact : pas de `<html>`/`<head>/<body>`, la coquille est fournie par l'hôte. C'est ce fichier qu'on modifie. |
| `index.html` | Version autonome, ouvrable en double-clic. **Générée** — ne pas éditer à la main. |
| `build.sh` | Régénère `index.html` à partir de `panel.html`. À lancer après chaque modification. |

```bash
./build.sh        # puis ouvrir index.html
```

## Ce que le panneau couvre

12 catégories, chacune avec son code de log à trois lettres :

`CNX` connexions · `CHT` chat & commandes · `CBT` combat & morts ·
`ECO` économie · `INV` inventaire · `VEH` véhicules · `JOB` jobs & entreprises ·
`IMM` propriétés · `ADM` administration · `ACH` anticheat · `SNC` sanctions ·
`RPT` reports & tickets.

- **Vue d'ensemble** — volume, joueurs distincts, alertes non traitées,
  détections anticheat, sanctions ; activité par heure ; répartition par
  catégorie ; file des alertes ouvertes ; joueurs les plus actifs.
- **Flux** — table dense, stries de gravité (critique / alerte / à vérifier /
  info), filtres par catégorie, gravité et période (1 h, 6 h, 24 h, 7 j),
  recherche plein texte (nom, ID serveur, licence, plaque, item, montant).
- **Inspecteur** — payload brut de l'évènement, identifiants, ressource
  émettrice, contexte des évènements voisins du même joueur, copie JSON ou
  ligne, épinglage et marquage « traité ».
- **Dossier joueur** — identifiants FiveM (license / discord / steam / fivem),
  comptes, sessions, éliminations, décès, détections, sanctions, historique.
- **Export** — la sélection courante en CSV dans le presse-papiers.
- **Direct** — nouvel évènement toutes les ~5 s, mise en pause d'un clic.
- **Raccourcis** — `/` recherche, `↑` `↓` navigation dans le flux, `Échap` ferme.

## Brancher le vrai serveur

Les évènements affichés sont **générés localement** (graine fixe, donc écran
stable d'un chargement à l'autre) pour que le panneau se voie en
fonctionnement. Un seul point de branchement, dans `panel.html` :

```js
const DataSource = {
  async fetch(){ /* votre endpoint ici */ },
  subscribe(cb){ /* websocket / polling : cb(evenement) */ }
};
```

Format attendu d'un évènement :

```js
{
  id:'EV-000123',
  t: 1757800000000,          // horodatage ms
  cat:'anticheat',           // id de catégorie (voir CATS)
  sev:'critique',            // critique | alerte | notice | info
  actor:{ name, sid, license, discord, steam, fivem, job, grade, hue, staff },
  target: joueur | null,
  msg:'texte affiché (HTML simple autorisé)',
  d:{ /* payload libre, rendu tel quel dans l'inspecteur */ },
  res:'origin_guard',        // ressource émettrice
  search:'…'                 // champ indexé pour la recherche, en minuscules
}
```

Côté serveur, le plus simple est un export depuis vos handlers Lua
(`RegisterNetEvent` + insertion SQL ou POST vers votre API), avec un endpoint
qui renvoie les N derniers évènements et un websocket pour le direct.

## Limites

- Tout est **côté client** : le panneau n'authentifie personne. Placez-le
  derrière votre propre contrôle d'accès staff avant de l'exposer.
- Les épingles et les marquages « traité » vivent dans le `localStorage` du
  navigateur — ils ne sont pas partagés entre membres du staff.
