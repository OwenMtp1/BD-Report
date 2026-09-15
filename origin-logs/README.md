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

**17 rubriques**, rangées par métier — le groupe porte la couleur, la
rubrique porte le nom :

| Groupe | Rubriques |
|---|---|
| **Modération** | `BAN` Bannissement · `AVT` Avertissement · `ACH` Anticheat |
| **Joueurs** | `CNX` Connexion · `DCX` Déconnexion · `ECR` Écran du joueur · `MRT` Mort joueur |
| **Argent & biens** | `TRX` Transactions et coffres · `SOL` Items au sol · `IMM` Immobilier |
| **Boutique** | `BQC` Boutique : caisse · `BQM` Boutique : monnaie et grades · `BQP` Boutique : produits |
| **Activités RP** | `ENT` Entreprise et crew · `CAS` Casino · `EMS` Facture EMS |
| **Staff & serveur** | `STF` Action staff |

Ce sont les rubriques du serveur, pas une liste générique : ce qui n'y figure
pas n'est plus journalisé du tout (le chat de proximité, les véhicules, le
craft, la drogue, les braquages, les organisations, la whitelist). Couper une
rubrique à la source coûte moins cher que de la masquer dans le panneau —
`Config.Categories` dans `resource/config.lua` le fait serveur par serveur.

⚠️ **La rubrique est la clé du reste.** Elle décide de ce qu'un rôle voit
(chaque rôle porte sa liste), de ce que la recherche peut atteindre et de ce
que le serveur de jeu a le droit d'écrire. En ajouter une : une ligne dans
`api/catalogue.js` (id **stable** — il est stocké sur chaque évènement), et
elle apparaît partout, rail compris. Une rubrique inconnue reçue du jeu est
rattachée à **Action staff** plutôt que rejetée : c'est une faute de frappe
dans un script, et elle doit se voir quelque part.

**Quatre gravités** — critique, alerte, à vérifier, info — lisibles d'un coup
d'œil à la strie de couleur en début de ligne.

### Écrans

- **Vue d'ensemble** — une ligne d'état (volume et écart avec la période
  précédente, joueurs distincts, anticheat, sanctions, bannis en cours), puis
  la file des alertes ouvertes en tête d'écran : c'est la seule question que
  le panneau existe pour poser. Le graphique d'activité est **empilé par
  gravité** — 40 évènements peuvent être 40 messages de chat ou 3 détections,
  et seul l'empilement montre quand la soirée a dérapé.
- **Bannissement** — un **registre**, pas une relecture du flux : qui est
  banni *maintenant*, pour quoi, par qui, jusqu'à quand. C'est cette table
  que le serveur de jeu interroge à chaque connexion. Filtres en cours /
  terminés / tous, **sa propre recherche** (joueur, motif, staff, licence)
  et levée en un clic pour qui en a le droit. La recherche se fait en SQL,
  donc au-delà des 300 lignes affichées — c'est justement quand le registre
  est long qu'on y cherche quelqu'un. Les compteurs des filtres restent ceux
  du registre entier : ils disent combien de bannissements existent, pas
  combien la recherche laisse passer.
- **Flux** — une timeline : gouttière d'horodatage, barre de gravité, code
  de catégorie, auteur et message. Recherche plein texte (nom, licence,
  plaque, item, montant, ID serveur), filtres par catégorie, gravité et
  période (1 h / 6 h / 24 h / 7 j), pagination, export CSV.
- **Recherche par rubrique** — chaque rubrique porte sa propre barre, et
  l'invite NOMME la rubrique (« Rechercher dans « Casino »… »). La
  recherche du haut cherchait déjà dans la rubrique ouverte, mais rien ne
  le disait : on la redonne là où la question se pose. Elle ne fait jamais
  sortir de la rubrique — en sortir à la première lettre tapée serait le
  contraire de ce qu'on demande — et l'adresse la porte, donc un lien collé
  rouvre la même recherche.
  ⚠️ Celle du **registre des bannissements** est SÉPARÉE (`STATE.banQ`) :
  le registre et le flux ne répondent pas à la même question, et partager
  un champ ferait qu'ouvrir l'un effacerait le filtre de l'autre.
- **Inspecteur** — payload brut de l'évènement, identifiants, ressource
  émettrice, contexte des évènements voisins du même joueur, épingle et
  marquage « traité » **partagés entre le staff**.
- **Dossier joueur** — identifiants FiveM, sessions, éliminations, décès,
  détections, sanctions, historique.
- **Écran du joueur** — la rubrique montre en tête un **bandeau de captures**
  (vignettes), et les lignes qui en portent une le signalent. Une vignette
  ouvre l'évènement, pas seulement l'image : c'est là que vivent le motif,
  le demandeur et les actions de modération.
- **Modération** — avertir, expulser, bannir, lever un bannissement, rendre un
  bien, **demander une capture d'écran**. Chaque action s'inscrit au journal
  avec le pseudo de son auteur.
- **Équipe** — création de comptes staff et changement de rôle depuis le
  panneau (réservé aux fondateurs).
- **Journal du panneau** — qui a consulté quel dossier, qui a exporté, qui a
  sanctionné. La surveillance est elle-même surveillée.
- **Supervision** et **Journal d'administration** — les deux écrans de
  l'administrateur de plateforme, décrits plus bas.

### Au quotidien

- **La recherche propose, elle ne devine pas.** Tapez trois lettres : elle
  offre la recherche texte (action par défaut, `Entrée`), les écrans qui
  correspondent, et les **joueurs** — dont le dossier s'ouvre directement.
- **Le nom d'un joueur dans le flux ouvre son dossier.** Pas besoin d'ouvrir
  l'évènement d'abord.
- **La coche au survol d'une ligne** marque l'évènement traité : la file
  d'alertes se vide sans rien ouvrir.
- **Les filtres en vigueur sont écrits** en haut d'écran et se retirent d'un
  clic — un écran vide dit pourquoi il est vide, et propose d'élargir à 7 jours.
- **L'adresse suit l'écran.** Le bouton Retour du navigateur fonctionne, un
  rechargement garde votre place, et un lien collé dans Discord rouvre
  exactement la même vue (`#/flux/anticheat?p=168`).

Raccourcis : `/` recherche · `↑` `↓` parcourir · `Entrée` ouvrir · `Échap`
fermer · `g` puis `o` / `f` / `b` (vue d'ensemble, flux, bannissements) ·
`?` l'aide complète.

---

## Connexion Discord

Le staff ne retient pas un mot de passe de plus : il clique sur **Continuer
avec Discord**. À chaque connexion, l'API vérifie deux choses avec le jeton du
bot — donc côté serveur, sans rien croire du navigateur :

1. la personne est bien **membre du serveur Discord** de l'espace ;
2. elle y porte bien le **rôle staff** dont l'identifiant a été renseigné par
   un fondateur.

Une même application Discord peut servir plusieurs espaces : à la connexion,
l'API cherche celui (ou ceux) où la personne est staff.

Ses **rôles Discord** sont ensuite traduits en rôles du panneau, et c'est ce
qui lui donne ses droits. Quelqu'un qui cumule Modérateur et Animateur obtient
l'**union** des deux : les droits s'ajoutent, jamais ne se retirent.

⚠️ **Un départ sur Discord ferme le panneau.** Les rôles sont revérifiés au
plus toutes les 15 minutes, en tâche de fond : qui perd le rôle staff voit ses
sessions fermées sans attendre leur expiration.

Tout se règle dans l'écran **Liaison Discord** (droit `settings.discord`,
fondateur) : identifiant du serveur, rôle staff, et un rôle Discord par rôle du
panneau — choisis dans une liste lue sur votre serveur, pour qu'aucun
identifiant ne se recopie à la main. Seuls les deux **secrets**
(`DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`) vivent dans `api/.env` et ne
repartent jamais vers le navigateur.

La connexion par mot de passe reste disponible pour le premier fondateur —
c'est elle qui permet d'aller configurer la liaison, et de rentrer si Discord
est en panne.

## Supervision de la plateforme

L'administrateur de plateforme n'a **aucun espace par défaut**. Il surveille
des espaces, il n'en habite aucun : à la connexion il arrive sur la
**supervision**, sans serveur courant. Le rail s'arrête là — pas de « Flux
complet », pas de rubriques : elles répondraient toutes « entrez d'abord dans
un espace », et dix-sept impasses ne valent mieux que rien.

⚠️ **Ce n'est pas seulement l'écran d'accueil qui change.** Tant qu'il n'est
entré nulle part, l'API refuse (409) toute route d'espace — journaux,
joueurs, registre, statistiques. Se replier sur le premier espace aurait servi
les journaux d'un client au hasard ; son compte a beau être né quelque part,
ce n'est plus un domicile.

**Entrer** est un geste, depuis la supervision ou « Espaces de logs », et la
barre affiche alors « visite — nom de l'espace · sortir ». **Ressortir** en
est un aussi : un clic sur cette étiquette, ou le bouton *Sortir* sur la carte
de l'espace.

🔑 **En visite, l'administration passe AVANT le fondateur de l'espace.**
Elle garde tous ses droits et toutes les rubriques, quel que soit l'espace :
elle peut composer et retirer ses rôles, rétrograder son fondateur, rouvrir un
espace fermé. Entrer chez quelqu'un ne revient pas à s'y soumettre — sinon
un fondateur pourrait se rendre intouchable dans son propre espace.

### Vue d'ensemble de tous les espaces

Une ligne d'état pour la plateforme entière (évènements sur 24 h, espaces
actifs, membres, bannis en cours, alertes ouvertes), le graphique d'activité
**cumulé** des 24 dernières heures, puis **une carte par espace**.

Chaque carte porte ce qui permet de dire en un regard si cet espace va bien :
volume reçu, dernier évènement, membres actifs et suspendus, bannis, alertes
non traitées, sanctions en attente d'exécution, propriétaire, rôles reliés à
Discord, rétention. La santé est résumée en tête de carte — *en ligne*,
*liaison incomplète*, *plus de journaux*, *fermé*.

### Journal d'administration

Le journal du panneau répond à « qui a consulté quel dossier ». Celui-ci
répond à une autre question : **qui a modifié quoi dans les espaces**. On y
lit les créations et fermetures d'espaces, les changements de propriétaire,
les régénérations de clé, les rôles créés, renommés, re-rangés ou supprimés,
les rubriques accordées ou retirées, les rôles attribués à la main, les accès
révoqués et les membres retirés — avec leur auteur, leur date et l'espace
concerné. Un filtre par famille d'action isole ce qu'on cherche.

Les deux journaux sont séparés parce qu'ils ne se lisent pas au même moment :
l'un sert à enquêter sur une bavure de modération, l'autre à comprendre
pourquoi un espace s'est mis à se comporter autrement.

### Le bouton « Vérifier »

Un clic, et la plateforme **se teste elle-même** : un bloc de contrôles pour
la plateforme, un par espace, chacun avec son verdict.

Côté plateforme : application Discord complète, intégrité de la base
(`PRAGMA quick_check`), taille du fichier, et le fait qu'il existe **au moins
deux** administrateurs de plateforme — un seul compte perdu, et plus personne
ne crée ni ne rouvre d'espace.

Par espace : le serveur de jeu écrit-il encore (et depuis quand), le bot
voit-il le serveur Discord, le rôle staff existe-t-il toujours là-bas, des
rôles du panneau sont-ils reliés, l'espace a-t-il un propriétaire et des
membres actifs, des sanctions décidées ici sont-elles restées sans effet en
jeu, des alertes traînent-elles depuis plus d'une semaine, la clé d'ingestion
est-elle assez longue.

⚠️ **Un constat qui ne dit pas quoi faire ne sert à rien** : chaque problème
porte son **remède**, à l'endroit où on le lit. « Le serveur de jeu n'écrit
plus » est suivi des trois causes possibles ; « rôle staff introuvable sur
Discord » explique qu'il a été recréé et où le choisir à nouveau. Les niveaux
sont distingués (✓ / ! / ✕) parce qu'un espace fermé qui n'ingère plus est
normal, alors qu'un espace actif dans le même état ne l'est pas.

⚠️ **La vérification ne part jamais toute seule** : elle interroge Discord
pour de vrai, une fois par espace. C'est un geste, pas une horloge.

---

## Espaces de logs

Un **espace** = un serveur de jeu + son serveur Discord + son équipe. Le
panneau en héberge autant que nécessaire, et ils ne se voient pas : chaque
espace a sa **clé d'ingestion** (celle d'un serveur n'ouvre jamais les
journaux d'un autre), ses rôles, ses membres et sa durée de rétention.

L'**administration de la plateforme** (bouton *Espaces de logs*) est un cran
au-dessus des fondateurs. Elle peut :

- **créer un espace** en renseignant son serveur Discord et son rôle staff —
  les 14 rôles d'origine y sont créés automatiquement ;
- **fermer** un espace avec un motif : les journaux restent, mais plus
  personne n'entre et le serveur de jeu cesse d'écrire ;
- **changer le propriétaire**, **révoquer un accès**, **retirer un membre** ;
- **régénérer la clé d'ingestion** d'un serveur compromis ;
- **entrer** dans n'importe quel espace pour le configurer — la barre affiche
  alors « visite », pour qu'on ne modère jamais un autre serveur en croyant
  être chez soi ;
- **supprimer** un espace, en recopiant son nom : l'effacement des journaux
  est définitif.

Ce droit ne s'accorde pas depuis un espace — sinon un fondateur se hisserait
au-dessus de tous les autres. Il se pose en console :

```bash
node staff.js platform <pseudo> on
```

## Captures de l'écran d'un joueur

Depuis le dossier d'un joueur ou l'inspecteur d'un évènement, **Demander une
capture** prend l'image de son écran **telle qu'elle est à cet instant** et la
dépose dans « Écran du joueur ».

Le chemin est celui de toutes les actions : le panneau ne parle jamais au
serveur de jeu, il dépose une tâche ; la ressource vient la chercher, prend la
capture avec **screenshot-basic**, et la renvoie à l'API. Aucun port de jeu à
ouvrir, aucune commande à distance.

```
panneau ──tâche──▶ API ──poll──▶ ressource ──screenshot-basic──▶ client
                    ◀──────── image ─────────┘
```

**Prérequis** : la ressource officielle
[screenshot-basic](https://github.com/citizenfx/screenshot-basic), et
`ensure screenshot-basic` **avant** `ensure origin_logs`. Sans elle, la demande
échoue avec un message qui dit quoi installer, au lieu de rester sans réponse.

⚠️ **Une capture est une action de modération, pas une consultation.** Elle
exige un **motif** d'au moins trois caractères, comme un avertissement ou un
bannissement, et elle s'inscrit au journal avec le pseudo de son auteur.

⚠️ **Chaque ouverture de l'image est journalisée** (`screen.vue`), pas
seulement la demande. C'est le seul moyen de répondre à « qui a regardé, et
quand ? » — la question qui se pose le jour où une capture circule.

⚠️ **Le droit `screens.request` est distinct de la modération** : par défaut
Fondateur, Administrateur, Gérant Brigade Anti-Cheat et Brigade Anti-Cheat.
Un modérateur peut expulser sans pouvoir regarder un écran, et c'est voulu —
ce sont deux gestes d'intrusion différents. Le droit s'accorde à un rôle
depuis « Rôles & accès » comme n'importe quel autre.

⚠️ **Voir la rubrique, c'est voir les captures** : la lecture d'une image est
refusée à qui n'a pas « Écran du joueur » dans ses rubriques, et la garde est
en SQL, pas dans l'interface.

**Prévenir le joueur ou non** est un choix de serveur, pas un défaut
technique : `Config.Screenshots.notifierJoueur` dans `resource/config.lua`.
Certains règlements l'imposent ; d'autres perdraient tout intérêt à la capture
en prévenant. À vous de trancher, et de l'écrire dans votre règlement.

Les images vivent sur le **disque** (`api/data/screens/`), pas dans la base :
une image en base64 dans SQLite gonfle chaque sauvegarde et chaque requête qui
la survole. Elles suivent la **rétention** de leur espace, et le fichier part
avec la ligne — sinon on garderait soit des images que rien ne référence, soit
des vignettes qui ne s'ouvrent plus. `SCREEN_DAYS` fixe une rétention à part,
`MAX_SCREEN_MB` le plafond par image (6 Mo par défaut).

---

## Revérification automatique des accès

Un membre du staff qui perd son rôle Discord perd son accès au panneau, **sans
que personne n'ait à y penser**.

⚠️ **La vérification à la connexion ne suffisait pas.** Elle ne part que
lorsque la personne fait une requête : quelqu'un qui perd son rôle et n'ouvre
plus le panneau gardait un compte actif indéfiniment — et une session valide
sept jours durant, prête à servir. C'est exactement le cas qu'on veut fermer :
celui de la personne qui part.

Un **balayage** passe donc en revue tous les comptes venus de Discord, qu'ils
se connectent ou non, toutes les `ACCESS_SWEEP_MIN` minutes (30 par défaut),
plus une fois au démarrage. Pour chacun il redemande à Discord : es-tu encore
sur le serveur, as-tu encore le rôle staff, quels rôles du panneau te
reviennent ? Un compte qui échoue est **désactivé et ses sessions fermées**.

⚠️ **Discord injoignable ne retire rien.** Confondre « le bot n'a pas
répondu » avec « cette personne n'est plus staff » couperait toute l'équipe à
la première panne réseau. Ces comptes sont comptés à part, et la supervision
les signale.

⚠️ **Rendre le rôle ne réactive pas le compte.** Rendre un accès est une
décision, pas une conséquence : sinon un rôle repris par erreur rouvrirait la
porte sans que personne ne l'ait voulu. La réactivation se fait à la main,
depuis « Gérer l'équipe ».

⚠️ **Les rôles posés à la main ne sont pas défaits** par le balayage : ce sont
des décisions de fondateur, et elles tiennent.

L'état se lit dans la **supervision** — dernier passage, comptes vérifiés,
accès retirés, comptes invérifiables — et « Vérifier » signale un balayage à
l'arrêt. `ACCESS_SWEEP_MIN=0` le désactive, et le contrôle le dit alors en
rouge : sans lui, un staff qui perd son rôle garde son accès.

---

## Rôles et permissions

**14 rôles de départ**, et rien n'est figé : un fondateur les renomme, change
leur rang, coche leurs droits **et les rubriques auxquelles ils donnent
accès**, en crée de nouveaux, et relie chacun à un rôle Discord (écran
*Rôles & accès*, droit `roles.manage`).

| Rang | Rôle | Fait | Voit |
|---|---|---|---|
| 100 | **Fondateur** | tout, y compris la liaison Discord, les rôles, les comptes et **l'export** | 17 rubriques |
| 90 | **Administrateur** | tout sauf la liaison Discord, la composition des rôles et l'export | 17 |
| 80 | **Développeur** | lecture et journal du panneau | 17 |
| 70 | **Gérant Brigade Anti-Cheat** | avertir, expulser, bannir, lever, identifiants | 10 |
| 65 | **Responsable Remboursement** | rendre un bien, avertir, identifiants | 12 |
| 60 | **Gérant Légal** | avertir | 10 |
| 60 | **Gérant Illégal** | avertir | 10 |
| 60 | **Gérant Animation** | rendre un bien | 10 |
| 60 | **Gérant Communication** | lecture | 4 |
| 50 | **Modérateur** | avertir, expulser | 13 |
| 45 | **Brigade Anti-Cheat** | avertir, expulser, bannir *(sans lever)* | 7 |
| 30 | **Helper** | avertir | 4 |
| 25 | **Animateur** | lecture | 7 |
| 25 | **Communication** | lecture | 4 |

⚠️ **L'export CSV est réservé au Fondateur.** Lire un journal à l'écran et en
sortir une copie qui vit ensuite hors du panneau sont deux gestes différents :
le second emporte des identifiants, des adresses et des montants dans un
fichier que plus personne ne trace. Le droit `logs.export` a donc quitté le
socle de lecture — il reste un droit comme un autre, que le Fondateur peut
accorder à un rôle depuis « Rôles & accès ». Le bouton **Exporter** est
absent, pas inerte, pour qui ne l'a pas : un bouton qui refuse n'apprend rien.

### Le rang, et qui peut quoi

Le rang décide qui peut gérer qui : on n'attribue, ne crée ni ne modifie
jamais un rôle **au-dessus du sien** — ce serait se donner par un détour des
droits qu'on n'a pas. Deux exceptions volontaires :

- le **propriétaire** de l'espace peut attribuer jusqu'à son propre rang.
  Sans cela, un fondateur ne pourrait jamais en nommer un second, et l'espace
  resterait suspendu à une seule personne ;
- l'**administration de la plateforme** n'est pas bornée.

### Attribution manuelle

Les rôles viennent de Discord, mais un fondateur garde le dernier mot :
cocher des rôles dans *Gérer l'équipe* les attribue **à la main**. Ils
l'emportent sur Discord et **survivent aux resynchronisations** — sinon la
décision serait défaite en quinze minutes. Tout décocher rend la main à
Discord.

⚠️ **Les restrictions sont appliquées par l'API, pas par l'interface.** Un
modérateur qui demanderait explicitement la catégorie `admin` ne l'obtient
pas, et les identifiants sont masqués dans la réponse elle-même. Masquer un
bouton n'a jamais protégé une donnée.

⚠️ **Le panneau ne manipule jamais la licence d'un joueur.** Ouvrir un
dossier ou viser une sanction demande un identifiant : sans le droit
`players.identifiers`, l'API renvoie un **alias** dérivé de la clé serveur
(`k:…`), utilisable pour agir mais impossible à remonter jusqu'à la licence.

Les 14 droits atomiques (`logs.view`, `actions.ban`, `roles.manage`…) sont
définis dans `api/catalogue.js`, qui ne fournit plus que les **valeurs de
départ** : la base fait foi.

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
node setup.js VotrePseudo   # clé serveur, .env, compte fondateur, marche à suivre
npm start                   # puis http://localhost:8080
npm run demo -- 600         # facultatif : remplir le panneau sans serveur de jeu
```

`setup.js` écrit la clé dans `.env`, que l'API relit au démarrage : il n'y a
rien à retaper. Elle n'est **jamais régénérée** si elle existe déjà — la
ressource FiveM la porte de son côté, et la changer couperait l'arrivée des
logs.

Réglages par variables d'environnement : `PORT`, `DB_FILE`, `SERVER_KEY`,
`RETENTION_DAYS` (30 par défaut), `SECURE_COOKIE=1` derrière HTTPS,
`SESSION_DAYS`, `PANEL_DIR`.

La base est un fichier : la sauvegarder, c'est le copier.

### 3. La ressource FiveM (`resource/`)

À copier dans `resources/origin_logs`, puis `ensure origin_logs` dans
`server.cfg`. Un seul fichier à éditer : `config.lua` (adresse de l'API et
`ServerKey`, identique à celle du serveur).

Elle fonctionne **sans framework** : les connexions, les déconnexions, les
morts et les détections passent par les évènements natifs de FiveM. ESX,
QBCore, QBox, ox_inventory et txAdmin sont raccordés **en plus** quand ils
sont présents — rien ne casse s'ils sont absents.

**Ce que la ressource remplit toute seule** : `Connexion`, `Déconnexion`,
`Mort joueur`, `Anticheat`, `Bannissement`, `Avertissement`, `Action staff`,
et — via les hooks de framework — `Transactions et coffres` et
`Entreprise et crew`.

**Ce que vos scripts doivent émettre** : `Écran du joueur`, `Items au sol`,
`Immobilier`, `Casino`, `Facture EMS` et les trois rubriques `Boutique`.
Aucun framework ne les expose de façon standard — elles dépendent de vos
ressources, et c'est justement pourquoi elles passent par l'export :

```lua
exports['origin_logs']:Log({
  cat = 'casino', sev = 'notice', actor = source,
  msg = ('%s a gagné 42 000 $ à la roulette'):format(GetPlayerName(source)),
  data = { kind = 'win', montant = 42000, jeu = 'roulette', table = 'table_3' }
})
```

Un évènement bien journalisé porte son `data` : c'est lui qui remplit
l'inspecteur, et c'est lui qu'on relit six semaines plus tard quand le joueur
conteste. Le `msg` sert à lire, le `data` sert à prouver.

---

## Ce qui bouge, et pourquoi

Le mouvement sert à **relier deux états**, pas à décorer. Trois endroits
seulement en portent.

**Le repère du rail glisse.** Un fond qui s'allume sur un onglet pendant
qu'un autre s'éteint ne relie pas les deux : on ne voit pas d'où l'on vient.
Un seul bloc se déplace donc d'un onglet à l'autre — et il est **mesuré**,
pas deviné : les rubriques varient d'un rôle à l'autre et les groupes n'ont
pas la même hauteur. Sans onglet actif (supervision hors espace) il s'efface
plutôt que de rester accroché au dernier endroit connu.

⚠️ **Sur téléphone le rail est horizontal** : un repère qui se déplace en
hauteur sur toute la largeur y deviendrait une barre posée en travers des
onglets. Il disparaît, et l'onglet actif reprend son propre fond.

**Le sélecteur de période glisse aussi**, pour la même raison. Les boutons
ayant la même largeur, sa position se calcule sans mesurer.

**Une ligne qui arrive en direct se signale une fois** : elle vient du haut
avec un halo qui s'éteint. Sans cela le direct pousse le contenu vers le bas
sans qu'on sache ce qui est neuf, et on relit le haut de l'écran à chaque
battement. Même idée pour un compteur du rail qui change.

⚠️ **L'entrée d'une vue ne se rejoue qu'au CHANGEMENT de vue.** `render()`
est rappelé à chaque rafraîchissement, à chaque marque posée, à chaque
évènement reçu : rejouer l'animation à chaque fois ferait clignoter l'écran
sous les yeux de qui lit.

⚠️ **La cascade des lignes s'arrête à la douzième.** Au-delà elle n'apprend
plus rien, et une page de 120 lignes mettrait une seconde à se poser.

⚠️ **Tout est en `transform` et `opacity`** — jamais en largeur, hauteur ou
position — pour que l'animation reste sur le compositeur et ne redessine pas
la page. Une seule courbe (`--ease`) pour tout : deux accélérations
différentes dans le même écran se remarquent, et mal.

⚠️ **`prefers-reduced-motion: reduce` coupe tout**, d'une règle. Le panneau
reste entièrement utilisable sans une seule animation — c'est la condition
pour s'autoriser à en mettre.

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

## Vérifier l'installation

Deux niveaux, et ils ne répondent pas à la même question.

**Le bouton « Vérifier »** de la supervision teste **votre** installation :
le bot est-il encore sur ce serveur Discord, le serveur de jeu écrit-il
toujours, les sanctions partent-elles. C'est le contrôle du jour.

**`npm test`** teste **le code** : 127 contrôles HTTP sur l'API — ingestion,
cloisonnement des espaces, rôles et rangs, permissions refusées, parcours
Discord complet, captures d'écran de bout en bout et **retrait automatique
d'un accès** (avec un faux Discord local, aucun réseau).

Ce dernier est celui qui compte : le faux Discord retire pour de vrai le rôle
staff d'un compte, sans qu'il se reconnecte, et la suite exige que son accès
tombe. Vérifier que la route répond n'aurait rien prouvé.

```bash
cd api
npm test              # les quatre suites
npm test discord      # une seule
```

⚠️ **Chaque suite part d'une base neuve**, et c'est le point. Ces tests
écrivent : ils créent des espaces, ferment, bannissent, relient des rôles.
Rejoués sur la base laissée par la fois précédente, ils échouaient sur des
faits qui n'étaient plus vrais — « 14 rôles d'origine » quand il y en avait
seize, un espace déjà fermé, une liaison Discord déjà posée. Une suite qu'on
ne peut pas relancer ne dit rien le jour où on en aurait besoin.

Aucune dépendance n'est installée pour autant : le lanceur (`api/test/run.js`)
sème la base, démarre l'API, lance la suite, arrête tout. Le faux Discord
(`api/test/faux-discord.js`) répond exactement ce que la liaison interroge.

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
