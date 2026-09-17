# Déploiement — Origin Roleplay, journal serveur

Trois étapes, dans cet ordre. Comptez une demi-heure la première fois.

Prérequis : **Node 22.5 ou plus récent** sur la machine qui héberge le site
(`node --version`). Rien d'autre — pas de base de données à installer, pas de
`npm install`.

---

## 1. L'API

```bash
# sur le serveur web, pas sur le serveur de jeu
cd origin-logs/api
node setup.js VotrePseudo
```

Une seule commande : elle génère la clé serveur, écrit `.env`, crée votre
compte fondateur et affiche la marche à suivre — y compris la ligne exacte à
coller dans `resource/config.lua`. **Notez le mot de passe affiché** : il
n'est stocké nulle part en clair.

```bash
npm start              # http://localhost:8080
npm run demo -- 600    # facultatif : remplir le panneau sans serveur de jeu
```

L'API relit `.env` au démarrage ; il n'y a rien à retaper. Vous pouvez y
ajuster :

| Variable | Rôle | Défaut |
|---|---|---|
| `SERVER_KEY` | clé partagée avec la ressource FiveM | écrite par `setup.js` |
| `PORT` | port d'écoute | `8080` |
| `HOST` | interface d'écoute | `0.0.0.0` |
| `DB_FILE` | fichier de base | `api/data/origin-logs.db` |
| `RETENTION_DAYS` | durée de conservation des journaux | `30` |
| `SECURE_COOKIE` | `1` dès que le site est en HTTPS | `0` |
| `SESSION_DAYS` | durée d'une session staff | `7` |
| `TRUST_PROXY` | `1` **derrière le reverse proxy ci-dessous** | `0` |
| `PUBLIC_URL` | adresse publique, ex. `https://logs.mon-rp.fr` | déduite |
| `ACCESS_SWEEP_MIN` | revérification des accès Discord, en minutes | `30` |
| `MAX_INGEST_PER_MIN` | dépôts de journaux par espace et par minute | `120` |
| `MAX_SCREENS_PER_MIN` | captures par espace et par minute | `20` |
| `SCREEN_QUOTA_MB` | disque maximal des captures, par espace | `2048` |
| `MAX_SCREEN_MB` | poids maximal d'une capture | `6` |
| `SCREEN_DAYS` | rétention propre aux captures (`0` = celle des journaux) | `0` |

⚠️ **`TRUST_PROXY` n'est pas un détail de confort.** `X-Forwarded-For` est un
en-tête, donc une donnée que le client choisit : sans ce réglage, l'API ne le
lit pas et s'en tient à l'adresse de la socket — la seule qu'on ne peut pas
forger. Mettez-le à `1` **seulement** derrière le proxy ci-dessous, qui
écrase l'en-tête au lieu de le compléter. À l'envers (API exposée en direct
avec `TRUST_PROXY=1`), le frein anti-force-brute redevient décoratif.

Pour ajouter des membres ensuite : depuis le panneau (bouton **Gérer
l'équipe**) ou `node staff.js add <pseudo> moderateur`.

### En service permanent (systemd)

`/etc/systemd/system/origin-logs.service` :

```ini
[Unit]
Description=Origin Roleplay — API du journal serveur
After=network.target

[Service]
Type=simple
User=origin
WorkingDirectory=/srv/origin-logs/api
Environment=SERVER_KEY=votre-cle
Environment=PORT=8080
Environment=SECURE_COOKIE=1
Environment=TRUST_PROXY=1
Environment=PUBLIC_URL=https://logs.mon-serveur.fr
Environment=RETENTION_DAYS=60
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now origin-logs
journalctl -u origin-logs -f
```

---

## 1 ter. L'administration de la plateforme

Un cran au-dessus des fondateurs : c'est elle qui crée les espaces de logs,
les ferme, change leur propriétaire et révoque des accès. Ce droit ne
s'accorde pas depuis le panneau — sinon un fondateur se hisserait au-dessus
des autres :

```bash
node staff.js platform VotrePseudo on
node staff.js spaces      # liste les espaces et leur clé d'ingestion
```

Ce compte-là n'a plus d'espace du tout à la connexion : il ouvre la
**supervision**, qui montre l'état de tous les espaces à la fois. Le rail se
limite à deux entrées — *Supervision* et *Journal d'administration* — et le
bouton **Espaces de logs** apparaît dans la colonne de gauche.

Pour modérer un serveur précis, il faut y **entrer** (bouton *Entrer* sur sa
carte) ; la barre affiche alors « visite — nom de l'espace · sortir », et un
clic dessus ressort. En visite, ce compte garde tous ses droits : il passe
avant le fondateur de l'espace visité.

### Vérifier l'installation d'un seul clic

Le bouton **Vérifier** de la supervision teste la plateforme et chaque espace
pour de vrai : secrets Discord en place, intégrité de la base, bot présent sur
chaque serveur Discord, rôle staff toujours existant, ingestion encore reçue,
sanctions effectivement exécutées en jeu. Chaque problème s'affiche avec le
geste qui le corrige.

C'est le premier réflexe après une mise en service ou un incident — plus sûr
que de lire les tables une par une, et plus rapide que d'attendre qu'un membre
du staff signale que « ça ne marche plus ».

### Ajouter un second serveur de jeu

1. **Espaces de logs** → *Créer un espace* : un nom, l'ID de son serveur
   Discord, l'ID de son rôle staff, sa rétention.
2. L'espace reçoit **sa propre clé d'ingestion**. Copiez-la dans le
   `config.lua` du second serveur de jeu — celle du premier n'ouvre pas ses
   journaux, et réciproquement.
3. Ses 14 rôles d'origine sont créés automatiquement. Reliez-les à ses rôles
   Discord depuis *Liaison Discord*, après y être **entré**.

⚠️ La barre affiche **« visite — nom de l'espace »** quand vous en visitez un
autre : on ne modère pas un serveur en croyant être chez soi.

⚠️ **Fermer** un espace conserve ses journaux mais coupe l'entrée et
l'ingestion. **Supprimer** efface tout, définitivement, et demande de
recopier le nom de l'espace.

---

## 1 bis. La connexion Discord (recommandé)

Sans elle, le panneau fonctionne avec des mots de passe. Avec elle, le staff
entre avec son compte Discord et ses **rôles Discord décident de ses droits**.

**a. L'application.** Sur `discord.com/developers/applications` → *New
Application*. Dans **OAuth2**, ajoutez l'URL de redirection exacte :

```
https://logs.origin-rp.fr/api/auth/discord/callback
```

(le panneau affiche celle qu'il attend dans l'écran « Liaison Discord » ;
c'est cette valeur-là qu'il faut coller, au caractère près).

**b. Le bot.** Onglet **Bot** → *Add Bot*, copiez le **jeton**. Invitez-le sur
votre serveur avec le scope `bot` — **aucune permission n'est nécessaire** : il
ne fait que LIRE la liste des membres et leurs rôles.

**c. Les deux secrets** dans `api/.env`, puis relancez l'API :

```
DISCORD_CLIENT_SECRET=...   # onglet OAuth2 de l'application
DISCORD_BOT_TOKEN=...       # onglet Bot
```

**d. Le reste dans le panneau.** Connectez-vous avec le compte fondateur créé
à l'étape 1, puis **Liaison Discord** dans la colonne de gauche :

1. identifiant de l'application (Client ID) et **identifiant du serveur
   Discord** (clic droit sur le serveur → *Copier l'identifiant*, mode
   développeur activé) ;
2. **Charger les rôles du serveur** — le bot les lit, et les champs deviennent
   des listes : plus d'identifiant à recopier ;
3. le **rôle staff** (obligatoire pour entrer) ;
4. un rôle Discord pour chaque rôle du panneau.

⚠️ Un membre qui a le rôle staff mais **aucun** rôle du panneau est refusé,
avec un message qui le lui dit — c'est volontaire : mieux vaut un refus
explicite qu'un panneau vide sans explication.

⚠️ Gardez au moins **un compte fondateur par mot de passe**. C'est lui qui
rouvre la porte si Discord est indisponible ou si la liaison est mal réglée.

---

## 2. Le site — HTTPS et reverse proxy

⚠️ **N'exposez jamais le port 8080 directement.** L'API ne fait pas de TLS :
sans proxy, le cookie de session et les mots de passe circulent en clair.

Caddy (le plus court) :

```
logs.origin-rp.fr {
    reverse_proxy 127.0.0.1:8080
}
```

Nginx :

```nginx
server {
    server_name logs.origin-rp.fr;
    listen 443 ssl;
    # ... vos certificats ...

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-For   $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Le flux temps réel est du SSE : sans ces deux lignes, les
        # évènements arrivent par paquets au lieu d'arriver en direct.
        proxy_buffering off;
        proxy_read_timeout 1h;
    }
}
```

Passez ensuite `SECURE_COOKIE=1`, **`TRUST_PROXY=1`** et
`PUBLIC_URL=https://votre-domaine`, puis redémarrez le service.

---

## 2 bis. Les captures d'écran (facultatif)

La rubrique « Écran du joueur » peut récupérer l'image de l'écran d'un joueur
sur demande du staff. Elle s'appuie sur la ressource officielle
**screenshot-basic** :

```bash
cd resources
git clone https://github.com/citizenfx/screenshot-basic
```

Puis dans `server.cfg`, **avant** `origin_logs` :

```
ensure screenshot-basic
ensure origin_logs
```

Réglages dans `resource/config.lua` → `Config.Screenshots` : format (`jpg` ou
`png`), qualité, plafond, et surtout `notifierJoueur` — prévenir ou non est un
choix de serveur, pas un défaut technique.

Côté API : `SCREEN_DIR` (dossier des images, `api/data/screens` par défaut),
`MAX_SCREEN_MB` (6) et `SCREEN_DAYS` (0 = même rétention que les journaux).
Le dossier grossit vite si les captures sont fréquentes : `du -sh api/data/screens`
le dit, et baisser `quality` à 0,5 divise le poids sans rendre l'image
inutilisable.

Sans screenshot-basic, rien d'autre ne change : la demande échoue avec un
message qui nomme la ressource à installer.

---

## 2 ter. Le retrait automatique des accès

Rien à installer : dès que la liaison Discord est en place, l'API revérifie
**tous** les comptes venus de Discord toutes les 30 minutes, et au démarrage.
Celui qui a perdu son rôle staff est désactivé et ses sessions fermées, même
s'il ne s'est pas reconnecté depuis.

```
ACCESS_SWEEP_MIN=30     # dans api/.env — 0 désactive (déconseillé)
```

L'état se lit dans **Supervision**, et le bouton **Vérifier** le signale s'il
est à l'arrêt. Une panne de Discord ne retire l'accès de personne : ces
comptes sont comptés à part.

---

## 3. La ressource FiveM

```bash
cp -r origin-logs/resource /chemin/vers/votre-serveur/resources/origin_logs
```

**C'est tout ce qui se copie.** Une ressource FiveM est un dossier : elle
n'ajoute rien aux autres, ne modifie aucun de leurs fichiers, et ne demande
aucune passerelle. Si vos `resources/` viennent du dépôt de quelqu'un
d'autre — une base publique, un template partagé — posez `origin_logs` **à
côté** de leur arborescence (beaucoup de serveurs ont un dossier `[local]`
ou `[perso]` pour cela) : leurs mises à jour ne toucheront jamais la vôtre,
et vous n'avez rien à leur demander.

### La clé se met dans `server.cfg`, jamais dans la ressource

```cfg
## secrets.cfg — à NE PAS versionner, chargé depuis server.cfg par « exec secrets.cfg »
set origin_logs_url  "http://127.0.0.1:8080"   # ou https://logs.origin-rp.fr
set origin_logs_key  "la-cle-generee-a-etape-1"
set origin_logs_name "origin-1"
```

⚠️ **`set`, surtout pas `setr`.** `setr` réplique la valeur chez les
clients : la clé repartirait exactement là où on ne veut pas d'elle.

⚠️ **Et surtout : ne remettez pas la clé dans `config.lua`.** Ce fichier est
déclaré `shared_script`, donc **téléchargé par chaque joueur et gardé dans
son cache**. Une clé posée là est une clé publique : n'importe qui peut
alors écrire dans vos journaux, ou les noyer pour y cacher autre chose. Les
trois réglages ci-dessus vivent dans `server/config_serveur.lua`, qui ne
quitte jamais la machine — et même lui les lit d'abord dans les convars,
pour que le dossier entier puisse être versionné sans rien révéler.

Si le serveur de jeu et le site sont sur la même machine, gardez
`127.0.0.1:8080` : la clé ne sort jamais du serveur.

Dans `server.cfg` :

```cfg
exec secrets.cfg      # les trois « set » ci-dessus
ensure baseevents     # sans lui, pas de morts ni d'éliminations journalisées
ensure screenshot-basic   # facultatif : sans lui, pas de captures d'écran
ensure origin_logs
```

Redémarrez, puis dans la console du serveur de jeu :

```
origin_logs_test
```

Un évènement doit apparaître dans le panneau, rubrique **Action staff**. S'il
n'arrive pas, la console dit laquelle des causes est en jeu : clé absente,
clé refusée, API injoignable, ou rubrique désactivée dans `config.lua`.

---

## 4. Le bot Discord (facultatif)

Les journaux dans vos salons, un par rubrique. Il vit à côté de l'API et
peut tourner ailleurs — il n'a besoin que de joindre le panneau.

**Un seul processus sert tous vos clients.** Chacun branche SA propre
application Discord depuis son panneau ; vous n'avez rien à faire par
client.

```bash
cd /srv/origin-logs/bot
cp .env.example .env
$EDITOR .env               # PANEL_URL + BOT_KEY (recopiée depuis api/.env)
node index.js --verifier   # la configuration est-elle complète ?
node index.js              # démarre
```

`setup.js` a déjà généré `BOT_KEY` dans `api/.env`. ⚠️ **Ce n'est pas un
jeton Discord** : elle permet seulement au processus de demander au panneau
*quels espaces servir*. C'est la seule route qui rende des jetons Discord,
et elle n'existe pas tant que `BOT_KEY` est vide.

**Côté client**, trois gestes dans son panneau (**Liaison Discord → Bot
Discord**) : coller le jeton de son application, **Tester**, puis inviter le
bot avec le lien que le panneau compose — permissions comprises. Le nouveau
client est servi dans les deux minutes, **sans redémarrage**.

⚠️ La clé de lecture se délivre toute seule avec le bot. La retirer coupe le
bot, jamais l'arrivée des journaux : ce sont deux clés et deux interrupteurs.

Détail complet, permissions Discord et dépannage : **[bot/README.md](bot/README.md)**.

---

## Ajouter votre équipe

Depuis le panneau : bouton **Gérer l'équipe** (fondateurs uniquement), ou en
console :

```bash
node staff.js add Kaleb moderateur
node staff.js list
node staff.js role Kaleb admin
node staff.js disable Kaleb      # ferme aussi ses sessions ouvertes
```

Donnez des comptes **nominatifs**. Le journal du panneau enregistre qui
consulte quel dossier et qui sanctionne qui : partagé à trois, il n'enregistre
plus rien d'utile.

---

## Journaliser vos propres scripts

La ressource couvre seule ce que le serveur de jeu publie : connexions,
déconnexions, morts, anticheat, bannissements, actions staff, et — quand le
framework est reconnu — l'argent, les métiers et les coffres.

**Huit rubriques ne peuvent venir que de vos scripts**, parce que rien de
standard ne les émet : les **reports** (les tickets ouverts en jeu), la
boutique (caisse, monnaie, produits), le casino, les factures EMS,
l'immobilier et les objets au sol. Elles appartiennent à des ressources que
chaque serveur choisit, écrit ou achète — un système de reports, notamment,
vit dans le panel staff et jamais ailleurs.

```lua
exports['origin_logs']:Log({
  cat   = 'casino',             -- voir le tableau des 18 rubriques
  sev   = 'alerte',             -- critique | alerte | notice | info
  actor = source,               -- un id de joueur, ou une table
  target = autreSource,         -- facultatif
  msg   = ('%s gagne 84 000 $ au blackjack'):format(GetPlayerName(source)),
  data  = { kind = 'gain', jeu = 'blackjack', gain = 84000 },
  res   = 'mon_casino'
})
```

`data` est rendu tel quel dans l'inspecteur : mettez-y tout ce qui aiderait à
trancher un litige trois jours plus tard. `kind` sert aux compteurs du dossier
joueur (`join`, `kill`, `death`).

📋 **Un exemple prêt à copier pour chacune des sept** :
**[resource/EXEMPLES.md](resource/EXEMPLES.md)**. Ils ne supposent aucun
framework — ni ESX, ni QBCore : l'export ne demande qu'un `source` et une
phrase. Le fichier dit aussi quelles rubriques **filtrer** avant de les
brancher : les objets au sol et les ouvertures de menu se comptent par
milliers sur une soirée, et tout remonter noie la rubrique.

⚠️ Une rubrique inconnue n'est pas rejetée : elle est rattachée à **Action
staff** et reste visible. Une faute de frappe dans un `cat` ne perd donc
rien — mais elle range l'évènement au mauvais endroit, et c'est exactement
ce qu'on découvre en ouvrant « Action staff » après avoir branché un script.

---

## Sauvegarde

**Elle est automatique, et il n'y a rien à installer.** L'API prend une
sauvegarde complète toutes les 24 heures dans `api/data/backups/` et garde
les 14 dernières ; la plus ancienne est jetée à mesure. Deux réglages dans
`api/.env` :

```ini
BACKUP_EVERY_HOURS=24     # 0 désactive (le contrôle de santé le signalera)
BACKUP_KEEP=14            # nombre de sauvegardes gardées
BACKUP_DIR=               # vide = api/data/backups
```

Depuis **Supervision → Sauvegardes** : la liste avec les dates et les
tailles, un bouton pour en prendre une tout de suite (avant une manœuvre),
le téléchargement et la suppression. **Supervision → Vérifier** dit l'ÂGE de
la dernière — une sauvegarde de trois semaines donne la tranquillité sans
donner le moyen de repartir.

⚠️ **Par « VACUUM INTO », jamais par copie du fichier `.db`.** La base tourne
en mode WAL : le fichier seul est un instantané INCOMPLET, les dernières
écritures vivant dans le `-wal` à côté. C'est la raison pour laquelle un
`cp` à chaud produit une sauvegarde qui s'ouvre et qui ment.

⚠️ **Les captures d'écran ne sont PAS dans ce fichier** : elles vivent à côté,
dans `api/data/screens/`. La sauvegarde automatique ne les emporte pas — une
image de plus par joueur et par demande gonflerait chaque copie sans rien
apprendre. À sauvegarder à part si elles comptent pour vous :

```bash
tar czf /sauvegardes/screens-$(date +%F).tgz -C /srv/origin-logs/api/data screens
```

### Sortir les sauvegardes de la machine

Une sauvegarde posée sur le disque qu'elle protège ne protège que d'une
fausse manœuvre, pas d'une panne. Recopiez-les ailleurs :

```bash
# Toutes les nuits, après l'heure de la sauvegarde automatique
0 5 * * * rsync -a /srv/origin-logs/api/data/backups/ sauvegarde@ailleurs:/logs/
```

⚠️ **Une sauvegarde contient TOUS les journaux de TOUS vos clients.** Là où
vous la copiez vaut l'accès au panneau : chiffrez-la si elle quitte votre
infrastructure, et n'en mettez pas dans un dépôt Git — `api/data/` est déjà
ignoré pour cette raison.

### Rendre ses journaux à UN client

La sauvegarde protège la plateforme ; elle ne sait rien rendre à un client en
particulier. Pour cela : **Supervision → la carte du client → Exporter cet
espace**. Un fichier JSON autonome avec ses journaux, ses joueurs, ses
sanctions, ses rôles et ses comptes.

Il se remet en service par **Supervision → Restaurer un espace…**, qui crée
**toujours un espace neuf** : écraser un espace en service sur la foi d'un
fichier est le geste le plus destructeur du panneau, et aucune confirmation
ne le rendrait sûr. Un doublon se supprime en un clic ; des journaux effacés,
non.

⚠️ **Les comptes reviennent SUSPENDUS**, et c'est voulu. Restaurer un export
dont l'original vit encore recrée ses comptes à l'identique ; la connexion,
qui cherche dans tous les espaces, en trouverait alors deux et refuserait de
choisir — plus personne ne se connecterait. Rendez la main aux comptes qui
doivent revenir, un par un.

⚠️ **Le fichier d'export vaut un accès** : il contient les empreintes de mots
de passe et la clé d'ingestion de l'espace. Transmettez-le comme un mot de
passe, pas comme une pièce jointe de plus.

---

## Si quelque chose ne marche pas

| Symptôme | Cause la plus fréquente |
|---|---|
| Le panneau affiche « démonstration » | La page n'est pas servie par l'API — ouvrez le domaine, pas le fichier. |
| Pas de bouton « Continuer avec Discord » | Il manque un des cinq réglages ; l'écran de connexion dit lequel. |
| « Lien de connexion expiré ou invalide » | L'URL de redirection de l'application Discord ne correspond pas exactement à celle affichée dans « Liaison Discord ». |
| « Vous n'êtes pas sur le serveur Discord » alors que si | Le bot n'est pas invité sur CE serveur, ou l'identifiant du serveur est faux. |
| Un staff garde ses droits après rétrogradation | Normal jusqu'à 15 minutes : c'est le délai de revérification. |
| « Clé serveur invalide » en console de jeu | `Config.ServerKey` ≠ `SERVER_KEY`. |
| Aucun évènement n'arrive | L'API n'est pas joignable depuis le serveur de jeu : testez `curl http://127.0.0.1:8080/api/catalogue`. |
| Pas de morts ni d'éliminations | `ensure baseevents` manque dans `server.cfg`. |
| Le direct arrive par paquets | `proxy_buffering off;` manque côté Nginx. |
| Déconnexion à chaque rechargement | `SECURE_COOKIE=1` sans HTTPS, ou l'inverse. |
| Les sanctions ne partent pas | Vérifiez que la ressource tourne : elle vient chercher les tâches toutes les 5 s. |
| « ressource screenshot-basic absente » | `ensure screenshot-basic` manque dans `server.cfg`, avant `origin_logs`. |
| Une capture reste « en attente » | Le joueur s'est déconnecté entre la demande et la prise, ou son client n'a pas répondu. |
| Un ancien staff se connecte encore | Le balayage tourne toutes les 30 min : lancez-le à la main depuis Supervision. |
| « Trop de dépôts pour cet espace » | Votre serveur envoie plus de 120 lots/min : groupez davantage (`Config.BatchSize`) ou montez `MAX_INGEST_PER_MIN`. |
| « Quota de captures atteint » | `SCREEN_QUOTA_MB` est plein : baissez `SCREEN_DAYS` ou augmentez le quota. |
| « Origine refusée » | Le panneau est ouvert depuis une autre adresse que `PUBLIC_URL`. |
| Un staff ne peut plus se connecter | Un homonyme dans un autre espace partage son mot de passe : changez-en un des deux. |
| Un espace semble en panne sans qu'on sache pourquoi | **Supervision → Vérifier** : le contrôle nomme la cause et le remède. |
