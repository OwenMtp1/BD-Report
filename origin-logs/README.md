# Origin Roleplay — Journal serveur

Panneau de logs pour serveur GTA RP (FiveM), en trois étages qui
fonctionnent ensemble mais s'installent séparément :

```
origin-logs/
├── panel.html · index.html · build.sh   le panneau (interface)
├── api/                                 l'API + la base (Node 22, zéro dépendance)
└── resource/                            la ressource FiveM qui émet les logs
```

Le panneau **fonctionne seul**, sans rien installer : ouvert en fichier, il
affiche un jeu de démonstration complet. Servi par l'API, il affiche vos
vrais journaux derrière une connexion staff. C'est le même fichier.

Installation pas à pas : **[DEPLOIEMENT.md](DEPLOIEMENT.md)**.

---

## Ce que le panneau couvre

**19 catégories**, rangées par métier — le groupe porte la couleur, la
catégorie porte le nom :

| Groupe | Catégories |
|---|---|
| **Modération** | `BAN` Bannissements · `SNC` Sanctions · `ACH` Anticheat · `RPT` Reports & tickets |
| **Joueurs** | `CNX` Connexions · `CHT` Chat & commandes · `CBT` Combat & morts |
| **Argent & biens** | `ECO` Économie · `INV` Inventaire · `VEH` Véhicules · `CRF` Craft & armes |
| **Activités RP** | `JOB` Jobs · `IMM` Propriétés · `ORG` Organisations · `BRQ` Braquages · `DRG` Drogue & labos |
| **Staff & serveur** | `ADM` Administration · `WLT` Whitelist · `SYS` Serveur |

**Quatre gravités** — critique, alerte, à vérifier, info — lisibles d'un coup
d'œil à la strie de couleur en début de ligne.

### Écrans

- **Vue d'ensemble** — une ligne d'état (volume et écart avec la période
  précédente, joueurs distincts, anticheat, sanctions, bannis en cours), puis
  la file des alertes ouvertes en tête d'écran : c'est la seule question que
  le panneau existe pour poser. Le graphique d'activité est **empilé par
  gravité** — 40 évènements peuvent être 40 messages de chat ou 3 détections,
  et seul l'empilement montre quand la soirée a dérapé.
- **Bannissements** — un **registre**, pas une relecture du flux : qui est
  banni *maintenant*, pour quoi, par qui, jusqu'à quand. C'est cette table
  que le serveur de jeu interroge à chaque connexion. Filtres en cours /
  terminés / tous, et levée en un clic pour qui en a le droit.
- **Flux** — une timeline : gouttière d'horodatage, barre de gravité, code
  de catégorie, auteur et message. Recherche plein texte (nom, licence,
  plaque, item, montant, ID serveur), filtres par catégorie, gravité et
  période (1 h / 6 h / 24 h / 7 j), pagination, export CSV.
- **Inspecteur** — payload brut de l'évènement, identifiants, ressource
  émettrice, contexte des évènements voisins du même joueur, épingle et
  marquage « traité » **partagés entre le staff**.
- **Dossier joueur** — identifiants FiveM, sessions, éliminations, décès,
  détections, sanctions, historique.
- **Modération** — avertir, expulser, bannir, lever un bannissement, rendre un
  bien. Chaque action s'inscrit au journal avec le pseudo de son auteur.
- **Équipe** — création de comptes staff et changement de rôle depuis le
  panneau (réservé aux fondateurs).
- **Journal du panneau** — qui a consulté quel dossier, qui a exporté, qui a
  sanctionné. La surveillance est elle-même surveillée.

Raccourcis : `/` recherche · `↑` `↓` navigation · `Échap` ferme.

---

## Rôles et permissions

Trois rôles, définis dans `api/catalogue.js` :

| | Modérateur | Administrateur | Fondateur |
|---|---|---|---|
| Lire les journaux | ✔ | ✔ | ✔ |
| Catégories visibles | 16 (sans Administration, Whitelist, Serveur) | 19 | 19 |
| Épingler / marquer traité | ✔ | ✔ | ✔ |
| Voir les identifiants (license, Discord, Steam) | — | ✔ | ✔ |
| Avertir, expulser | ✔ | ✔ | ✔ |
| Bannir, lever un ban, rendre un bien | — | ✔ | ✔ |
| Registre des bannissements (lecture) | ✔ | ✔ | ✔ |
| Journal du panneau | — | ✔ | ✔ |
| Gérer les comptes staff | — | — | ✔ |

⚠️ **Les restrictions sont appliquées par l'API, pas par l'interface.** Un
modérateur qui demanderait explicitement la catégorie `admin` ne l'obtient
pas, et les identifiants sont remplacés par « — masqué — » dans la réponse
elle-même. Masquer un bouton n'a jamais protégé une donnée.

---

## Les trois étages

### 1. Le panneau (`panel.html`)

| Fichier | Rôle |
|---|---|
| `panel.html` | **La source.** C'est ce fichier qu'on modifie. |
| `index.html` | Version autonome, ouvrable en double-clic. **Générée.** |
| `build.sh` | Régénère `index.html`. À lancer après chaque modification. |

Il détecte tout seul son mode : s'il obtient une réponse de `/api/auth/me`,
il passe en production et demande une connexion ; sinon il bascule en
démonstration et le dit à l'écran.

### 2. L'API (`api/`)

Node 22 ou plus récent, **aucune dépendance npm** : SQLite et le chiffrement
sont intégrés à Node. Un seul processus sert aussi le panneau.

```bash
cd api
SERVER_KEY=$(openssl rand -hex 24) node server.js
node staff.js add VotrePseudo fondateur     # premier compte
node seed-demo.js 600                       # facultatif : jeu d'essai
```

Réglages par variables d'environnement : `PORT`, `DB_FILE`, `SERVER_KEY`,
`RETENTION_DAYS` (30 par défaut), `SECURE_COOKIE=1` derrière HTTPS,
`SESSION_DAYS`, `PANEL_DIR`.

La base est un fichier : la sauvegarder, c'est le copier.

### 3. La ressource FiveM (`resource/`)

À copier dans `resources/origin_logs`, puis `ensure origin_logs` dans
`server.cfg`. Un seul fichier à éditer : `config.lua` (adresse de l'API et
`ServerKey`, identique à celle du serveur).

Elle fonctionne **sans framework** : les connexions, le chat, les morts, les
explosions et les détections passent par les évènements natifs de FiveM. ESX,
QBCore, QBox, ox_inventory et txAdmin sont raccordés **en plus** quand ils
sont présents — rien ne casse s'ils sont absents.

Pour journaliser depuis vos propres scripts :

```lua
exports['origin_logs']:Log({
  cat = 'braquages', sev = 'alerte', actor = source,
  msg = ('%s a lancé le braquage de la Fleeca'):format(GetPlayerName(source)),
  data = { kind = 'start', banque = 'Fleeca Legion', equipe = 4 }
})
```

---

## Choix qui méritent une explication

**Le bannissement vit dans l'API, pas dans le serveur de jeu.** C'est elle que
`playerConnecting` interroge. Conséquence voulue : un ban survit à un wipe de
la base du framework, et fonctionne quel que soit celui que vous choisirez.

**Si l'API ne répond pas, les joueurs entrent quand même.** Une panne du
panneau de logs ne doit pas fermer le serveur à tout le monde. La ressource
attend 5 secondes, journalise l'incident en console, et laisse passer.

**Le panneau ne parle jamais au serveur de jeu.** Il dépose une tâche que la
ressource vient chercher toutes les 5 secondes. Aucun port de jeu à ouvrir,
aucune commande à distance.

**L'anticheat mesure côté serveur** (`GetEntityCoords`, `GetEntityHealth`) :
un anticheat qui croit le client sur parole ne détecte que les tricheurs qui
ont oublié de mentir. Le client ne signale qu'une chose que le serveur ne voit
pas seul — le moment où le joueur tire — et la position est relue côté serveur.

**Les logs partent groupés** (40 évènements ou 3 secondes). Une requête HTTP
par ligne mettrait le serveur à genoux un soir de forte affluence. Si l'API
tombe, la file est gardée en mémoire jusqu'à 3 000 évènements.

---

## Limites connues

- **L'API ne fait pas de HTTPS elle-même.** Mettez-la derrière un reverse
  proxy (Nginx, Caddy) et passez `SECURE_COOKIE=1`. Sans cela, le cookie de
  session circule en clair.
- **`node:sqlite` est marqué expérimental par Node.** L'API est stable dans
  les versions ciblées, mais c'est à savoir avant de mettre en production.
- **Pas de double authentification.** Un mot de passe long, et des comptes
  nominatifs — le journal du panneau ne sert à rien si trois personnes
  partagent le même identifiant.
- **La rétention supprime définitivement.** 30 jours par défaut ; augmentez
  `RETENTION_DAYS` avant que les premiers journaux n'expirent si vous en avez
  besoin plus longtemps.
