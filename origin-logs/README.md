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

**18 rubriques**, rangées par métier — le groupe porte la couleur, la
rubrique porte le nom :

| Groupe | Rubriques |
|---|---|
| **Modération** | `BAN` Bannissement · `AVT` Avertissement · `ACH` Anticheat · `RPT` Logs des Reports |
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

### Logs des Reports

Les tickets ouverts en jeu, et **les quatre moments** qui les font : le
joueur qui ouvre (avec le motif qu'il a tapé, pas celui que le staff
retiendra), le staff qui prend, le staff qui refuse, et le ticket que
personne n'a pris.

⚠️ **C'est la quatrième qui justifie la rubrique.** On journalise toujours
ce que le staff a fait, jamais ce que le joueur a demandé : le journal dit
alors que tout a été traité, et ne montre ni les refus, ni les tickets
restés en attente — c'est-à-dire exactement ce qu'on cherche quand un joueur
écrit « j'ai fait un report et personne n'est venu ».

La prise et le refus portent **deux personnes** : le staff en auteur, le
joueur en cible. C'est ce qui range l'évènement dans les deux dossiers et
qui permet de répondre à « qui a pris le ticket de qui ».

Aucune ressource standard ne les émet — le système de reports appartient au
panel staff de chaque serveur. Le code à copier est dans
**[resource/EXEMPLES.md](resource/EXEMPLES.md)**, et les noms employés
ailleurs (`report`, `ticket`, `tickets`, `signalement`) y mènent déjà.

⚠️ **Une rubrique ajoutée au catalogue n'existe pour personne tant que les
rôles en base ne la portent pas** — et les rôles ne se ré-ensemencent
jamais, précisément pour qu'un redémarrage ne défasse pas le travail d'un
fondateur. Un rattrapage l'accorde donc une fois, et seulement à deux
sortes de rôles : ceux qui portaient déjà **toutes** les autres rubriques
(ils disaient « tout »), et les rôles **intégrés que personne n'a
retouchés**, auxquels on applique la valeur de départ du catalogue. Un rôle
recomposé par le client n'est jamais élargi : sa liste est une décision.

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

## Livrer un espace à un serveur client

Un espace = un serveur de jeu client. Depuis **Espaces de logs**, chaque
carte porte un bouton **Fiche d'installation** : il compose le bloc exact à
transmettre à ce client — l'adresse de VOTRE panneau, SA clé d'ingestion,
son nom de serveur, et les trois `ensure`.

⚠️ « Copier la clé » ne suffit pas quand on livre à quelqu'un d'autre : la
clé seule ne dit ni où l'envoyer, ni dans quel fichier la mettre, ni ce
qu'il ne faut surtout pas en faire. La fiche dit les trois.

⚠️ **Posez `PUBLIC_URL`** dans `api/.env` : sans elle, la fiche porte
l'adresse par laquelle vous avez ouvert le panneau — `localhost` si vous
l'administrez depuis la machine, ce qui ne mènerait nulle part chez le
client. La fiche le signale quand le cas se présente.

Le client, lui, n'installe que le dossier `resource` et colle le bloc. Il ne
voit rien des autres espaces : journaux, rôles, staff et captures sont
cloisonnés en SQL, et sa clé n'ouvre que le sien.

---

## Vendre : formules, échéances, et ce qui s'applique tout seul

Un espace de logs se vend. La **formule** est la seule chose qui distingue
commercialement un client d'un autre, et elle vit **en base** — pas dans le
code : on ajuste un tarif ou un plafond bien plus souvent qu'on ne
redéploie. Trois formules de départ, modifiables, et on en crée d'autres :

| | Comptes staff | Rétention | Captures | Quota d'images | Dépôts/min |
|---|---|---|---|---|---|
| **Starter** | 5 | 7 j | non | — | 60 |
| **Pro** | 25 | 30 j | oui | 512 Mo | 120 |
| **Illimité** | sans limite | sans limite | oui | plafond du serveur | plafond du serveur |

⚠️ **« Sans limite » n'est pas « zéro ».** Une formule sans plafond est le cas
courant de l'offre haute ; confondre les deux aurait fait de l'offre la plus
chère la plus bridée. En base, c'est `NULL`, jamais `0`.

⚠️ **La formule BORNE, elle ne fixe pas.** Un client qui demande 7 jours de
rétention en formule Illimitée garde 7 jours : c'est le plafond qui descend,
jamais la demande qui monte.

Les plafonds s'appliquent **là où le geste se fait**, pas dans l'écran qui le
propose : créer un compte au-delà du quota renvoie un refus qui **nomme la
formule et son plafond** (« Starter : 5 comptes »), déposer une capture sans
l'option la refuse, et le débit d'ingestion est plafonné en SQL. Un plafond
qui ne vivrait que dans l'interface ne serait pas un plafond.

**Échéance.** Chaque espace porte une date de fin facultative. Quand elle
tombe, l'espace se **ferme tout seul** : plus personne n'entre, et le serveur
de jeu cesse d'être accepté. Fermer n'est pas supprimer — les journaux
restent, et repousser la date rouvre. C'est ainsi qu'on coupe un client sans
avoir à y penser, et qu'on le rétablit sans rien perdre.

Écrans : **Supervision → Formules** (créer, modifier, supprimer — une formule
utilisée ne se supprime pas), et la carte de chaque espace pour lui attribuer
sa formule et sa date.

---

## Tenir la boutique : sauvegardes, poids, export

**Les sauvegardes sont automatiques** — toutes les 24 h, les 14 dernières
gardées, par `VACUUM INTO` (en WAL, une copie du `.db` seul est un
instantané incomplet). **Supervision → Sauvegardes** les liste, en prend une
à la demande, les télécharge ; **Vérifier** dit leur ÂGE, parce qu'une
sauvegarde de trois semaines donne la tranquillité sans donner le moyen de
repartir.

**Le poids est affiché par espace** et pour la plateforme, avec un seuil
d'alerte. Approximatif, et l'écran le dit : SQLite n'attribue pas ses pages à
un locataire. On mesure ce qui est mesurable — la longueur des textes
journalisés et la taille réelle des images — c'est l'essentiel du volume, et
cela évolue juste.

**Un espace s'exporte** en un fichier autonome (« rendez-moi mes journaux »
est la demande d'un client qui part) et se **restaure**, toujours dans un
espace NEUF. ⚠️ Ses comptes reviennent **suspendus** : restaurer un export
dont l'original vit encore recrée ses comptes à l'identique, et la connexion,
qui cherche dans tous les espaces, en trouverait deux et refuserait de
choisir — plus personne ne se connecterait.

Détail et commandes : **[DEPLOIEMENT.md § Sauvegarde](DEPLOIEMENT.md)**.

---

## Données personnelles

Un identifiant FiveM désigne une personne : le panneau traite donc des
données personnelles, et le vendre à un serveur fait de vous un
**sous-traitant** au sens du RGPD.

Ce qui est **dans l'outil**, droit `players.gdpr`, depuis le dossier joueur :

- **Exporter** tout ce que le panneau détient sur une personne (art. 15) —
  un fichier remis tel quel.
- **Effacer** ses évènements (art. 17). ⚠️ Un bannissement en cours n'est pas
  supprimé mais **pseudonymisé** (`effacé-xxxxxxxx`) : la mesure reste
  opposable sans porter le nom de la personne. Le panneau exige une
  confirmation explicite dans ce cas — deux intérêts s'opposent, c'est à un
  humain de trancher, pas à un bouton.
- L'effacement **laisse lui-même une trace** : « telles données ont été
  effacées, par untel, à telle date » est précisément ce qui prouve qu'il a
  eu lieu.

Ce qui est **à côté**, dans **[juridique/](juridique/)** : un contrat de
sous-traitance (art. 28) à signer avec le client, une mention d'information
que le client affiche à ses joueurs, et un registre de conservation qui dit
ce qui est gardé, où et combien de temps.

⚠️ **Ce sont des MODÈLES, pas un avis juridique.** Ils sont écrits d'après ce
que le code fait — et c'est leur limite : ils décrivent l'outil, pas votre
situation. Faites-les relire par un juriste avant de les signer ou de les
publier. Une suite de contrôle vérifie que les durées qu'ils annoncent sont
bien celles que le code applique : un registre qui dit 30 jours quand le code
en applique 90 est pire qu'absent, puisqu'il fait répondre faux à un joueur.

⚠️ **Aucune adresse IP n'est collectée**, et aucun mot de passe en clair
n'existe en base.

---

## Cloisonnement : chaque espace est à lui

Les rôles vivent en base **par espace** : les renommer, les recomposer ou en
créer dans un serveur ne touche jamais l'autre, et deux espaces peuvent avoir
un rôle portant la même clé sans se gêner.

⚠️ **Deux défauts trouvés et corrigés à l'audit** — les COMPTES, eux, ne
l'étaient pas :

- `pseudo` était unique **globalement**. Un espace ne pouvait donc pas avoir
  son « Nyx » si un autre en avait un — et le refus révélait au passage
  l'existence d'un compte dans un espace qu'on n'administre pas.
- l'index sur `discord_id` était global lui aussi : **la même personne ne
  pouvait pas être staff sur deux serveurs**, la création de son second
  compte échouait sur la contrainte.

L'unicité porte désormais sur `(espace, pseudo)` et `(espace, discord_id)`,
et la migration reconstruit la table sans perdre une ligne.

⚠️ **La connexion doit alors départager les homonymes**, et elle n'accepte
que si le mot de passe en désigne **exactement un**. Prendre le premier qui
correspond ouvrirait la porte du mauvais espace à qui partage un pseudo ET un
mot de passe ; deux comptes identiques sur les deux sont donc refusés, avec
le message qui dit quoi changer. `staff.js add` prévient d'ailleurs quand le
pseudo existe ailleurs.

⚠️ **Plus de rôle de repli codé en dur.** Un compte créé sans rôle valide
prenait `moderateur` : dans un espace qui l'avait renommé ou supprimé, le
compte se retrouvait avec une clé inexistante, donc aucun droit, et un écran
vide sans explication. Le repli est maintenant **le rôle le plus bas de CET
espace** (`ROLESVC.basRole`).

---

## Rôles et permissions

**14 rôles de départ**, et rien n'est figé : un fondateur les renomme, change
leur rang, coche leurs droits **et les rubriques auxquelles ils donnent
accès**, en crée de nouveaux, et relie chacun à un rôle Discord (écran
*Rôles & accès*, droit `roles.manage`).

| Rang | Rôle | Fait | Voit |
|---|---|---|---|
| 100 | **Fondateur** | tout, y compris la liaison Discord, les rôles, les comptes et **l'export** | 18 rubriques |
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
`server.cfg`. **Rien d'autre à toucher** : une ressource FiveM est un
dossier, elle ne modifie aucun fichier des autres et ne demande aucune
passerelle. Elle peut donc cohabiter avec une base venue du dépôt de
quelqu'un d'autre, sans fork et sans rien leur demander.

⚠️ **L'adresse de l'API et la clé se posent dans `server.cfg`**, pas dans la
ressource :

```cfg
set origin_logs_url "http://127.0.0.1:8080"
set origin_logs_key "la clé affichée par npm run setup"
```

Parce que `config.lua` est un `shared_script` : **son contenu est téléchargé
par chaque joueur et reste dans son cache**. Une clé d'ingestion posée là est
une clé publique — n'importe qui peut écrire dans vos journaux, ou les noyer
pour y cacher autre chose. Les secrets vivent donc dans
`server/config_serveur.lua`, qui ne quitte jamais la machine, et même lui les
lit d'abord dans les convars : le dossier entier peut être versionné sans
rien révéler.

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

**`npm test`** teste **le code** : 167 contrôles HTTP sur l'API — ingestion,
cloisonnement des espaces, rôles et rangs, permissions refusées, parcours
Discord complet, captures d'écran de bout en bout et **retrait automatique
d'un accès** (avec un faux Discord local, aucun réseau).

Ce dernier est celui qui compte : le faux Discord retire pour de vrai le rôle
staff d'un compte, sans qu'il se reconnecte, et la suite exige que son accès
tombe. Vérifier que la route répond n'aurait rien prouvé.

```bash
cd api
npm test              # les six suites
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

## Sécurité : ce qui est en place, ce qui reste à vous

**En place** — mots de passe scrypt et comparaison à temps constant · sessions
en base, donc révocables immédiatement · cookie `HttpOnly` + `SameSite=Lax`
(+ `Secure` avec `SECURE_COOKIE=1`) · **SQL entièrement paramétré** · le texte
venu du jeu est échappé avant affichage · en-têtes de sécurité sur **toutes**
les réponses, JSON compris · traversée de chemin bloquée · clé d'ingestion
comparée à temps constant, par espace · état OAuth signé HMAC · licences
jamais envoyées aux rôles sans le droit (alias HMAC) · permissions appliquées
**en SQL**, pas dans l'écran · journal de tout ce qui est consulté.

**Corrigé à l'audit** (`npm test`, suite `securite`) :

- ⚠️ **Le frein anti-force-brute était contournable.** `clientIp()` faisait
  confiance à `X-Forwarded-For` sans condition : il suffisait de changer
  l'en-tête à chaque tentative pour repartir de zéro. Il n'est lu que si
  **`TRUST_PROXY=1`** le dit, et un second frein porte sur le **compte** visé,
  pas seulement sur l'adresse.
- ⚠️ **Le dépôt de journaux et de captures n'avait aucune limite.** Une clé
  qui fuit pouvait remplir le disque ; seule la purge, toutes les six heures,
  freinait. Plafond par espace et par minute (`MAX_INGEST_PER_MIN`,
  `MAX_SCREENS_PER_MIN`), plus un **quota disque** par espace
  (`SCREEN_QUOTA_MB`) qui **refuse** au lieu d'effacer d'anciennes captures —
  ce sont peut-être celles d'une enquête.
- ⚠️ **`SameSite=Lax` était la seule couche anti-CSRF.** Une écriture dont
  l'`Origin` n'est pas la nôtre est refusée et inscrite au journal. Une
  lecture, elle, n'est pas bloquée.
- ⚠️ **`/api/catalogue` livrait vos rôles sans session** — grades, rangs et
  droits, à tout visiteur. Sans session, il ne rend plus que les rubriques et
  les gravités, dont la page de connexion a besoin.
- ⚠️ **`Host` et `X-Forwarded-*` pouvaient influencer l'URL de retour OAuth.**
  `PUBLIC_URL` tranche la question une fois pour toutes.
- ⚠️ **Les captures étaient lisibles par tout compte de la machine.** Dossier
  en `0700`, fichiers en `0600`, servis avec `nosniff`, en `inline` sous un nom
  neutre et sans mise en cache.
- ⚠️ **`origin_logs:tir` était appelable en boucle par n'importe quel client.**
  Un tricheur noyait la rubrique Anticheat — une façon efficace d'y cacher une
  vraie détection. Un signalement par joueur et par seconde.

**Ce qui reste, et qui demande une décision de votre part :**

- **Pas de HTTPS en propre** : reverse proxy obligatoire, puis
  `SECURE_COOKIE=1` **et `TRUST_PROXY=1`** (le proxy du guide écrase
  `X-Forwarded-For`, donc l'en-tête redevient fiable).
- **CSP avec `'unsafe-inline'`** : le panneau est un fichier unique dont les
  scripts sont en ligne. La retirer suppose de découper le panneau et de
  poser un nonce à chaque réponse — faisable, mais c'est un autre chantier.
  Conséquence à connaître : la CSP ne rattraperait pas un XSS s'il en
  apparaissait un.
- **Captures en clair sur le disque.** Les permissions les protègent d'un
  autre service sur la machine, pas d'une sauvegarde qui fuite. Les chiffrer
  suppose une clé à gérer, donc votre arbitrage.
- **Pas de double authentification** — la connexion Discord la remplace en
  pratique, puisque l'accès dépend d'un rôle que vous contrôlez.

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
