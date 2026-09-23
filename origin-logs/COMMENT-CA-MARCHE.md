# Comment le panneau fonctionne, expliqué simplement

Ce document répond à deux questions :

1. **Que dois-je faire, concrètement, pour le mettre en service ?** (§ 1)
2. **Comment ça marche à l'intérieur ?** — et en particulier le scan (§ 2)

Il est écrit pour quelqu'un qui code un peu mais n'a jamais administré de
serveur. Aucun prérequis.

---

# § 1 — La mise en service, étape par étape

Chaque étape dit : **ce que vous tapez**, **où**, **ce que vous devez voir**,
et **ce que ça débloque**.

## Vue d'ensemble

Vous allez installer **deux choses sur la même machine** :

```
         VOTRE VPS
 ┌──────────────────────────────┐
 │  Serveur FiveM  ──(HTTP)──▶  │
 │       │                      │
 │       └── resources/         │
 │            origin_logs/      │   le mouchard
 │                              │
 │  Panneau (Node + SQLite)     │   le réceptacle
 │       écoute sur :8080       │
 └──────────────────────────────┘
```

Le mouchard écoute le jeu et envoie. Le panneau reçoit, range, affiche.

---

## Étape 1 — Se connecter à la machine

**Où :** sur votre PC, dans PowerShell (Windows) ou Terminal (Mac/Linux).

```bash
ssh root@VOTRE.IP
```

**Résultat attendu :** l'invite change et affiche le nom de la machine
(`root@vps-12345:~#`). Vous êtes « dedans ».

**Ce que ça débloque :** tout le reste. Chaque commande des étapes 2 à 5 se
tape dans cette fenêtre.

> Si ça refuse : mot de passe faux, ou le port SSH n'est pas 22 (votre
> hébergeur l'indique ; ajoutez alors `-p LEPORT`).

---

## Étape 2 — Installer Node 22

**Où :** dans la fenêtre SSH.

```bash
node --version
```

**Résultat attendu :** `v22.5.0` ou plus. Si c'est plus bas, ou
« command not found » :

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs git
node --version
```

**Résultat attendu :** `v22.x.x`.

**Ce que ça débloque :** le panneau tourne sur Node et **n'a aucune
dépendance** — pas de `npm install`, pas de base de données à installer. Il
utilise SQLite, qui est *intégré à Node 22*. C'est pour ça que la version
compte : en dessous, ce module n'existe pas.

---

## Étape 3 — Récupérer le panneau et créer votre compte

```bash
cd /srv
git clone https://github.com/OwenMtp1/BD-Report.git
cd BD-Report
git checkout claude/origin-roleplay-logs-panel-kym4bf
cd origin-logs/api
npm run setup VotrePseudo
```

**Résultat attendu :** un cadre qui affiche une **clé serveur** (longue suite
de caractères) et un **mot de passe**.

📌 **Copiez les deux dans un bloc-notes.** Le mot de passe n'est stocké nulle
part en clair — il n'est pas « retrouvable », seulement réinitialisable.

**Ce que ça débloque :**
- le fichier `api/.env` est créé (vos réglages) ;
- la base `api/data/origin-logs.db` est créée (vide) ;
- votre compte **fondateur** existe ;
- l'**espace n°1** existe, avec sa clé d'ingestion.

Donnez-vous aussi le droit d'administrer la plateforme (créer des espaces
clients, générer les commandes d'installation) :

```bash
node staff.js platform VotrePseudo on
```

---

## Étape 4 — Démarrer le panneau

```bash
npm start
```

**Résultat attendu :** un encadré du genre

```
  Origin Roleplay — API des journaux
  ├─ écoute        http://0.0.0.0:8080
  ├─ base          /srv/BD-Report/origin-logs/api/data/origin-logs.db
  ├─ rétention     30 jours
  ├─ espaces       1
  └─ sauvegardes   toutes les 24 h, 14 gardées
```

**Ce que ça débloque :** le panneau tourne. Laissez cette fenêtre ouverte
pour l'instant (l'étape 8 le rendra permanent).

---

## Étape 5 — L'ouvrir depuis votre PC

**Où :** une **deuxième** fenêtre PowerShell/Terminal, sur votre PC.

```bash
ssh -L 8080:127.0.0.1:8080 root@VOTRE.IP
```

Laissez-la ouverte, puis dans votre navigateur : **http://localhost:8080**

**Résultat attendu :** l'écran de connexion. Entrez le pseudo et le mot de
passe de l'étape 3.

**Ce que ça débloque :** vous voyez le panneau, **sans rien exposer sur
Internet**. Le tunnel SSH fait passer le trafic par votre connexion SSH
existante ; personne d'autre ne peut l'atteindre.

> ⚠️ Avant de donner l'accès à votre staff, il faudra un nom de domaine et du
> HTTPS (`DEPLOIEMENT.md` § 2) — sinon leurs mots de passe circulent en clair.

---

## Étape 6 — Brancher Discord

**Où :** moitié sur `discord.com/developers/applications`, moitié dans le
panneau.

**a.** *New Application* → un nom → *Create*.

**b.** Onglet **Bot** → *Reset Token* → copiez le jeton.
Onglet **OAuth2** → *Reset Secret* → copiez le secret. Notez aussi le
**Client ID** (même page).

**c.** Invitez le bot sur votre serveur Discord (onglet *Installation*, scope
`bot`, **aucune permission** : il ne fait que lire les membres et leurs rôles).

**d.** Dans la fenêtre SSH, collez les deux secrets dans `api/.env` :

```bash
nano /srv/BD-Report/origin-logs/api/.env
```

Ajoutez deux lignes :

```
DISCORD_CLIENT_SECRET=...
DISCORD_BOT_TOKEN=...
```

Ctrl+O, Entrée, Ctrl+X. Puis relancez le panneau (Ctrl+C dans la fenêtre du
`npm start`, puis `npm start`).

**e.** Dans le panneau → **Liaison Discord** (colonne de gauche) :
- il affiche l'**URL de redirection exacte** → copiez-la et collez-la dans
  Discord (*OAuth2 → Redirects → Add Redirect → Save Changes*) ;
- collez le **Client ID** et l'**ID de votre serveur Discord** ;
- cliquez **Charger les rôles du serveur** : le bot les lit, les champs
  deviennent des listes ;
- choisissez le **rôle staff** (obligatoire pour entrer) puis, pour chaque
  rôle du panneau, le rôle Discord correspondant.

**f.** Reliez votre compte fondateur à votre compte Discord — **ne sautez pas
cette étape** : sans elle, entrer par Discord crée un **second** compte à côté
du vôtre.

> Panneau → **Gérer l'équipe** → votre compte → champ *Compte Discord relié* →
> collez votre identifiant (17-20 chiffres).

**Résultat attendu :** l'écran de connexion affiche un bouton bleu
« Continuer avec Discord ».

**Ce que ça débloque :**
- votre staff se connecte avec Discord, sans mot de passe ;
- **les rôles Discord décident des droits** : promu sur Discord = promu dans
  le panneau, automatiquement ;
- quelqu'un qui perd son rôle perd l'accès (revérifié toutes les 30 min) ;
- si une personne est staff sur **plusieurs** de vos serveurs, un sélecteur
  apparaît dans la barre pour passer de l'un à l'autre.

---

## Étape 7 — Brancher un serveur FiveM

**Où :** dans le panneau, puis chez le client.

Panneau → **Espaces de logs** → *Créer un espace* (nom du client, son serveur
Discord, son rôle staff) → sur sa carte, **Fiche d'installation** → **Générer
la commande d'installation**.

**Résultat attendu :** une ligne du type

```bash
bash <(curl -fsSL https://votre-panneau/install) ORG-4F2K-9BQX
```

Le client la colle sur sa machine. Le script trouve son `server.cfg`, installe
la ressource, écrit la clé dans un `secrets.cfg` privé, complète la
configuration. Il redémarre son serveur.

**Vérification :** dans la console FiveM, `origin_logs_test` → la ligne doit
apparaître dans le panneau, rubrique « Action staff ».

**Ce que ça débloque :** les logs arrivent. C'est le moment où le produit
existe vraiment.

---

## Étape 8 — Que ça survive au redémarrage

```bash
nano /etc/systemd/system/origin-logs.service
```

```ini
[Unit]
Description=Origin Roleplay — panneau de logs
After=network.target

[Service]
Type=simple
WorkingDirectory=/srv/BD-Report/origin-logs/api
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now origin-logs
systemctl status origin-logs
```

**Résultat attendu :** `active (running)`.

**Ce que ça débloque :** vous pouvez fermer votre SSH. Le panneau tourne seul,
redémarre tout seul s'il plante, et revient après un reboot du VPS.

---

# § 2 — Comment ça marche à l'intérieur

## 2.1 Le trajet d'une ligne de log

```
  EN JEU                    SUR LA MACHINE                DANS LE NAVIGATEUR
  ──────                    ──────────────                ──────────────────
  un joueur     ──▶  origin_logs (Lua)  ──HTTP──▶  api/server.js  ──▶  panneau
  achète une         met la ligne dans      POST       range en base        affiche
  voiture            une file d'attente   /api/ingest   (SQLite)          en direct
```

Points à retenir :

- **La ressource n'envoie pas ligne par ligne.** Elle empile et envoie par
  paquets (40 lignes, ou toutes les 3 secondes). Une requête HTTP par
  évènement mettrait le serveur à genoux un soir de rush.
- **Si le panneau est éteint, rien n'est perdu** tout de suite : la file garde
  jusqu'à 3000 lignes en mémoire et réessaie.
- **La clé décide de tout.** Chaque envoi porte l'en-tête `X-Origin-Key`.
  Elle dit *quel espace* reçoit. Une clé fausse = refus, point.

## 2.2 Ce qu'il y a dans la base

Un seul fichier, `api/data/origin-logs.db`. Les tables qui comptent :

| Table | Ce qu'elle contient |
|---|---|
| `spaces` | un client = un espace (nom, clé d'ingestion, serveur Discord, formule) |
| `events` | **les logs**. Une ligne = un évènement |
| `players` | les joueurs vus, pour ouvrir leur dossier |
| `sanctions` | le registre des bans — c'est lui que le jeu interroge à la connexion |
| `staff` | les comptes du panneau |
| `roles` | les rôles de chaque espace et leurs droits |
| `actions` | les ordres du panneau vers le jeu (bannir, capturer…) |
| `inventory` / `scans` | ce que le serveur du client fait tourner (§ 2.4) |
| `hooks` | les raccordements posés par le scan (§ 2.5) |

⚠️ **`space_id` est partout.** Chaque ligne appartient à un espace, et toutes
les requêtes filtrent dessus. C'est ce qui garantit qu'un client ne voit
jamais les logs d'un autre — la séparation est **en SQL**, pas dans
l'affichage.

## 2.3 Les rubriques sont FIXES — le scan n'en crée jamais

C'est votre question principale, alors soyons nets.

Les **18 rubriques** (Bannissement, Anticheat, Connexion, Transactions et
coffres, Casino, Action staff…) sont écrites **en dur** dans
`api/catalogue.js`. Elles ne bougent que si on modifie ce fichier.

```js
const CATS = [
  { id:'bans',       label:'Bannissement',  group:'moderation' },
  { id:'inventaire', label:'Transactions et coffres', group:'biens' },
  …
];
```

Conséquences :

- **le scan REMPLIT des rubriques existantes**, il n'en invente aucune ;
- une rubrique inconnue envoyée par un script tombe dans **« Action staff »**
  (`CAT_FALLBACK`) — volontairement : une faute de frappe doit se **voir**
  quelque part plutôt que disparaître ;
- quelques anciens noms sont traduits automatiquement (`economie` →
  `inventaire`, `chat` → `ecran_joueur`) ;
- ce sont ces mêmes rubriques qui servent de **droits** : un rôle « Modérateur »
  voit certaines rubriques, pas toutes. Filtré **en SQL**, là encore.

## 2.4 L'inventaire — « qu'est-ce qui tourne chez ce client ? »

Au démarrage du serveur de jeu (15 secondes après, pour laisser les autres
ressources démarrer), `origin_logs` envoie la **liste des noms** des ressources
présentes :

```json
{ "framework": "qb",
  "ressources": [ {"nom":"qb-core","etat":"started"},
                  {"nom":"Renewed-Banking","etat":"started"}, … ] }
```

Le panneau compare à son catalogue (`api/ecosysteme.js`) et range en trois tas :

- **déjà branché** (ESX, QBCore, ox_inventory, baseevents…) ;
- **connu mais pas raccordé** (« Renewed-Banking alimenterait *Boutique :
  caisse* ») ;
- **inconnu** (tout le reste).

Ça ne découvre rien de neuf, mais ça répond à la question qu'on se pose à
chaque livraison : *pourquoi la rubrique Banque est-elle vide chez ce client ?*

## 2.5 Le scan — « qu'est-ce que ce code sait faire ? »

### Ce qu'il fait, dans l'ordre

1. Vous cliquez **Intégration** dans le panneau.
2. Le panneau **dépose une tâche** dans la table `actions`. ⚠️ Il ne parle
   jamais au serveur de jeu : c'est la ressource qui vient chercher ses
   tâches toutes les 5 secondes. Aucun port de jeu à ouvrir.
3. La ressource lit le **code serveur des autres ressources**
   (`LoadResourceFile`, une fonction que FiveM fournit).
4. Elle en extrait les **noms des évènements écoutés** — uniquement ça :

   ```lua
   RegisterNetEvent('banque:retirer')      →  "banque:retirer"
   AddEventHandler('braquage:fin', …)      →  "braquage:fin"
   ```

5. Elle envoie **cette liste de noms** à `POST /api/scan`.

### ⚠️ Ce qu'il n'envoie PAS

**Aucune ligne de code.** Ni fichier, ni extrait, ni chemin. Seulement des
noms d'évènements.

Ce n'est pas de la pudeur : beaucoup de ressources FiveM sont **payantes et
sous licence**. Envoyer leur source vers un panneau tiers serait un problème
juridique et commercial, pas un détail technique.

### Le tri, côté panneau

Sur les 200 noms trouvés, la plupart ne valent rien. Trois filtres :

1. **Le bruit est écarté.** Un nom qui contient `hud`, `sync`, `tick`,
   `position`, `stress`… se déclenche des milliers de fois par minute. À 40
   joueurs, ça ferait des millions de lignes par jour et un panneau illisible.
2. **Les ressources connues imposent leur rubrique**, vérifiée à la main.
3. **Le reste est deviné par mots-clés** : `banque`/`withdraw`/`atm` →
   *Boutique : caisse* ; `garage`/`vehicle`/`house` → *Immobilier* ;
   `ban`/`kick` → *Bannissement*/*Avertissement*…

⚠️ **On compare des MOTS, pas des morceaux de mots.** C'est un bug que j'ai
corrigé en écrivant les tests : en cherchant le mot-clé n'importe où dans le
nom, `draw` (du bruit d'affichage) reconnaissait `withdraw` — et l'évènement de
**retrait bancaire**, exactement celui qu'on veut, partait à la poubelle.
Aujourd'hui le nom est découpé en mots (`playerHudTick` → player, hud, tick).

Ce qui n'évoque **rien** n'est pas rangé au hasard : il est écarté, et le
panneau dit combien.

### Le raccordement

Ce qui survit est écrit dans la table `hooks` et **activé d'office** :

| ev | cat | active |
|---|---|---|
| `banque:retirer` | `boutique_caisse` | 1 |
| `braquage:fin` | `jobs` | 1 |

La ressource lit cette table toutes les minutes (`GET /api/hooks`) et pose ses
écouteurs elle-même :

```lua
AddEventHandler('banque:retirer', function(...)
  Origin.Log({ cat = 'boutique_caisse', msg = 'banque:retirer', … })
end)
```

**Il n'y a aucun fichier à déposer chez le client.** Décocher un raccordement
dans le panneau le coupe en moins d'une minute — la ressource relit la liste,
elle n'exécute pas un fichier figé.

### Trois garde-fous

- ⚠️ **Jamais `RegisterNetEvent`, seulement `AddEventHandler`.** Enregistrer en
  « net » un évènement qui ne l'était pas le rendrait déclenchable **par les
  joueurs** : n'importe qui pourrait alors appeler le script d'origine — celui
  qui donne l'argent. On écoute, on n'ouvre rien.
- ⚠️ **Les arguments inconnus sont ramenés à du texte** avant d'entrer dans la
  file. Une fonction ou une table cyclique aurait fait échouer l'encodage du
  **lot entier**, emportant des évènements valides avec elle.
- ⚠️ **Un évènement qui s'emballe est mis en sourdine** au-delà de 120
  déclenchements par minute, et la console le dit.

### Ce que le scan ne peut pas faire

- Les ressources **protégées par escrow** (Cfx) ont leur code chiffré. Le
  panneau les **nomme** au lieu de se taire : « code illisible » et « rien
  trouvé » ne se réparent pas pareil.
- Un `server_scripts { 'server/*.lua' }` **ne se déplie pas** : FiveM n'expose
  aucune lecture de dossier. On tente les noms de fichiers les plus courants,
  et ces ressources sont lues **partiellement**.
- **Il n'existe pas d'espion universel** dans FiveM : pour écouter un
  évènement, il faut connaître son nom. C'est exactement ce que le scan sert à
  trouver.

## 2.6 Le sens inverse : du panneau vers le jeu

Bannir quelqu'un depuis le panneau ne « commande » pas le serveur de jeu.

```
 panneau  ──▶  table `actions`  ◀──  la ressource demande
                                     toutes les 5 s : « du neuf ? »
```

C'est la ressource qui vient chercher. Conséquence : **aucun port du serveur
de jeu n'a besoin d'être ouvert**, et le panneau n'a aucun pouvoir direct
dessus. Même mécanisme pour les captures d'écran et pour le scan.

## 2.7 Ce qui tourne en fond, tout seul

| Quoi | Quand | Pourquoi |
|---|---|---|
| Purge des vieux logs | toutes les 6 h | tenir la rétention (sauf conservation illimitée) |
| Sauvegarde | toutes les 24 h, 14 gardées | une sauvegarde qu'il faut penser à prendre n'est pas prise |
| Revérification des accès Discord | toutes les 30 min | quelqu'un qui part doit perdre l'accès même s'il ne se reconnecte pas |
| Échéances des formules | toutes les heures | un client non payé se coupe sans geste manuel |

---

## En résumé

- Le mouchard **envoie**, le panneau **range**, le navigateur **affiche**.
- Les rubriques sont **fixes** ; le scan les **remplit**, il n'en crée jamais.
- Le panneau ne commande **jamais** le jeu : il dépose, le jeu vient chercher.
- Le code du client **ne quitte jamais sa machine**.
- Tout est cloisonné par `space_id`, **en SQL**.
