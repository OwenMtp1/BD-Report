# Installer Origin Logs sur un VPS

**Ce fichier est un mode d'emploi destiné à un assistant (Claude) qui a un accès
terminal au VPS.** Colle-le entier dans la conversation, avec l'archive
`origin-logs.tar.gz`, et demande-lui de le suivre.

---

## Pour l'humain — ce qu'il faut avant de commencer

Trois choses, et rien d'autre :

1. **Un VPS** sous Debian 12 / Ubuntu 22.04 ou plus récent, avec un accès `root`
   ou `sudo`. 1 Go de RAM et 10 Go de disque suffisent largement.
2. **L'archive `origin-logs.tar.gz`** (environ 500 Ko), envoyée par Owen. Elle
   ne contient **ni secret ni base de données** : ceux du VPS naîtront à
   l'étape 4.
3. **Un nom de domaine** pointant sur l'IP du VPS (un enregistrement `A`).
   Par exemple `logs.mon-serveur.fr`. Sans lui, l'installation fonctionne
   quand même, mais en `http://` sur l'IP — c'est bon pour essayer, pas pour
   s'en servir.

Rien à acheter, rien à installer d'autre : le produit **n'a aucune dépendance
npm**. Il tourne avec Node seul.

---

## Instructions à l'assistant

Tu installes un panneau de journalisation pour serveurs FiveM. Suis les étapes
**dans l'ordre**. Après chaque étape il y a une **vérification** : exécute-la,
et ne passe à la suivante que si elle donne le résultat annoncé.

Quatre règles :

- **N'invente aucune commande ni aucun nom de fichier.** Tout ce dont tu as
  besoin est ici. Si quelque chose manque, dis-le à l'humain plutôt que de
  deviner.
- **Ne modifie pas le code de l'application.** Ce n'est pas une installation
  qui se répare en retouchant les sources ; si une étape échoue, la cause est
  dans la section « Si quelque chose ne marche pas », à la fin.
- **Arrête-toi et demande** chaque fois que tu vois 🛑 dans ce document.
- **Montre à l'humain, en clair, les deux secrets** que l'installation
  produit (mot de passe du compte fondateur, clé serveur). Ils ne sont
  affichés qu'une fois.

---

## Ce que tu installes, en trois phrases

Une API Node qui reçoit les journaux d'un ou plusieurs serveurs de jeu FiveM et
les range dans une base SQLite locale, plus une page web qui les affiche. Un
serveur de jeu y dépose ses évènements avec une clé ; une équipe les lit avec un
compte. Tout tient dans un dossier et un processus.

---

## Étape 1 — Poser le code

Décompresse l'archive dans `/srv/origin-logs` :

```bash
sudo mkdir -p /srv/origin-logs
sudo tar -xzf origin-logs.tar.gz -C /srv/origin-logs
```

**Vérification** — ces quatre chemins doivent exister :

```bash
ls /srv/origin-logs/api/server.js \
   /srv/origin-logs/api/setup.js \
   /srv/origin-logs/index.html \
   /srv/origin-logs/resource/fxmanifest.lua
```

Si `index.html` manque et que `panel.html` est là, régénère-le :

```bash
cd /srv/origin-logs && bash build.sh
```

---

## Étape 2 — Node 22

⚠️ **Il faut Node 22.5.0 ou plus.** Le produit utilise `node:sqlite`, qui
n'existe pas avant. Debian 12 livre Node 18 : ça ne suffit pas.

```bash
node --version
```

Si la version affichée est inférieure à `v22.5.0`, ou si la commande n'existe
pas :

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Vérification** :

```bash
node --version    # doit afficher v22.x, avec x ≥ 5
node -e "require('node:sqlite'); console.log('sqlite disponible')"
```

Si la seconde commande échoue, la version de Node est trop ancienne — n'essaie
pas de contourner, reprends l'installation de Node.

**Aucun `npm install` n'est nécessaire**, à aucun moment. Le projet n'a aucune
dépendance. Si tu es tenté de lancer `npm install`, c'est que tu t'es trompé de
dossier.

---

## Étape 3 — Un utilisateur dédié

L'API ne doit pas tourner en `root`.

```bash
sudo useradd --system --home /srv/origin-logs --shell /usr/sbin/nologin origin || true
sudo chown -R origin:origin /srv/origin-logs
```

**Vérification** :

```bash
ls -ld /srv/origin-logs    # le propriétaire doit être « origin »
```

---

## Étape 4 — Mise en route

Une seule commande. Elle génère la clé serveur, écrit `api/.env`, crée la base
et le premier compte.

Remplace `NOM` par le pseudo avec lequel l'humain se connectera (3 caractères
minimum — demande-le-lui s'il ne l'a pas dit) :

```bash
cd /srv/origin-logs/api
sudo -u origin node setup.js NOM
```

🛑 **La sortie affiche deux choses qui ne seront plus jamais affichées :**

```
  │  Clé serveur   (nouvelle)
  │  9d95dda991e6e6d635cd6bdfbff93756b19fdfe69bbdf4d9
  │
  │  Compte fondateur   NOM
  │  Mot de passe       oS2iJMklzkR9apHF
```

**Recopie-les intégralement à l'humain et dis-lui de les noter maintenant.** Le
mot de passe n'est stocké nulle part en clair ; la clé serveur reste lisible
dans `api/.env`, mais le mot de passe, non.

**Vérification** :

```bash
sudo -u origin test -f /srv/origin-logs/api/.env && echo ".env écrit"
sudo -u origin stat -c '%a' /srv/origin-logs/api/.env   # doit afficher 600
sudo -u origin node staff.js list                        # doit lister le compte
```

---

## Étape 5 — Le service

`/etc/systemd/system/origin-logs.service` :

```ini
[Unit]
Description=Origin Logs — API du journal serveur
After=network.target

[Service]
Type=simple
User=origin
WorkingDirectory=/srv/origin-logs/api
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

⚠️ **Aucun secret dans ce fichier.** Tout est déjà dans `api/.env`, qui est en
`600` et n'est pas lisible par les autres utilisateurs — un fichier systemd, lui,
est lisible par tout le monde.

À savoir si tu dois dépanner plus tard : quand une même variable est définie aux
deux endroits, **c'est systemd qui gagne** — `api/.env` ne remplace jamais une
variable déjà posée dans l'environnement. C'est une cause classique de « j'ai
changé le fichier et rien ne bouge ».

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now origin-logs
```

**Vérification** :

```bash
systemctl is-active origin-logs                       # doit afficher « active »
curl -s http://127.0.0.1:8080/api/auth/options        # doit répondre du JSON
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/   # doit afficher 200
```

La réponse de `/api/auth/options` ressemble à ceci — c'est normal à ce stade,
Discord n'est pas encore branché :

```json
{"discord":false,"manque":["identifiant d’application", "..."],"motDePasse":true}
```

Si le service ne démarre pas : `journalctl -u origin-logs -n 40 --no-pager`.

---

## Étape 6 — Le domaine et HTTPS

🛑 **Demande à l'humain le nom de domaine** qu'il a fait pointer sur ce VPS.
S'il n'en a pas, dis-le-lui : l'installation restera accessible en `http://` sur
l'IP, ce qui suffit pour essayer mais **pas** pour s'en servir — les mots de
passe et le cookie de session circuleraient en clair, et la connexion Discord ne
fonctionnera pas.

⚠️ **N'expose jamais le port 8080 directement.** L'API ne fait pas de TLS.

Caddy s'occupe du certificat tout seul :

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```

Remplace `logs.mon-serveur.fr` par le vrai domaine, puis écris
`/etc/caddy/Caddyfile` :

```
logs.mon-serveur.fr {
    reverse_proxy 127.0.0.1:8080
}
```

```bash
sudo systemctl reload caddy
```

**Vérification** (depuis le VPS, puis depuis un navigateur) :

```bash
curl -sI https://logs.mon-serveur.fr | head -1     # doit afficher HTTP/2 200
```

Si le certificat échoue, la cause est presque toujours l'une des deux
suivantes : le domaine ne pointe pas encore sur cette IP (`dig +short LE-DOMAINE`
doit rendre l'IP du VPS), ou le port 80 est fermé — Let's Encrypt en a besoin
pour vérifier.

### Le pare-feu

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw --force enable
sudo ufw status
```

⚠️ **N'ouvre pas le 8080.** Il ne doit être joignable que depuis la machine
elle-même.

---

## Étape 7 — Reboucler la configuration sur HTTPS

Maintenant que le site répond en HTTPS, trois réglages doivent le savoir.
Édite `/srv/origin-logs/api/.env` :

```bash
SECURE_COOKIE=1
TRUST_PROXY=1
PUBLIC_URL=https://logs.mon-serveur.fr
HOST=127.0.0.1
```

- `SECURE_COOKIE=1` — le cookie de session ne part plus qu'en HTTPS.
- `TRUST_PROXY=1` — l'API lit l'adresse réelle du visiteur dans l'en-tête posé
  par Caddy. **Sans ce réglage derrière un proxy, le frein anti-force-brute
  compte toutes les tentatives comme venant d'une seule adresse** et ne protège
  plus rien. Ne le mets **que** derrière un proxy : posé sans proxy, il ferait
  confiance à une adresse que le visiteur choisit lui-même.
- `PUBLIC_URL` — fige l'adresse publique. Elle sert à composer l'URL de retour
  de la connexion Discord et la fiche d'installation remise aux clients.
- `HOST=127.0.0.1` — l'API cesse d'écouter sur l'extérieur. Le proxy lui parle
  en local ; plus personne d'autre.

```bash
sudo systemctl restart origin-logs
```

**Vérification** :

```bash
systemctl is-active origin-logs
curl -sI https://logs.mon-serveur.fr | head -1         # HTTP/2 200
curl -s -m 3 http://IP-DU-VPS:8080/ -o /dev/null -w '%{http_code}\n' || echo "8080 injoignable de l'extérieur — c'est ce qu'on veut"
```

---

## Étape 8 — Ouvrir l'administration

Le compte créé à l'étape 4 est fondateur de l'espace de départ. Pour qu'il
administre **la plateforme** — créer des environnements clients, composer les
offres, gérer l'équipe — il faut le dire explicitement :

```bash
cd /srv/origin-logs/api
sudo -u origin node staff.js platform NOM
```

⚠️ Ce droit **ne s'accorde pas depuis l'interface** : sinon le fondateur d'un
serveur client pourrait se hisser au-dessus de tous les autres.

**Vérification** :

```bash
sudo -u origin node staff.js list    # la colonne ÉTAT doit afficher PLATEFORME
```

🛑 **Dis à l'humain d'ouvrir `https://logs.mon-serveur.fr` et de se connecter**
avec le pseudo et le mot de passe de l'étape 4. Il doit arriver sur un écran
**« Supervision »**, avec dans la barre de gauche : Supervision, Liste des
environnements, Offres, Équipe & rôles, Journal d'administration. C'est la
preuve que tout fonctionne.

S'il n'a pas noté le mot de passe, il n'est pas perdu :

```bash
sudo -u origin node staff.js passwd NOM     # en génère un nouveau et l'affiche
```

---

## Étape 9 — La connexion Discord (facultatif, recommandé)

Sans elle, on se connecte au pseudo et au mot de passe, et ça marche. Avec elle,
l'équipe se connecte avec son compte Discord et les rôles du panneau se
distribuent d'après les rôles Discord.

🛑 **C'est à l'humain de faire cette partie**, sur
`https://discord.com/developers/applications` — tu ne peux pas le faire pour
lui. Donne-lui ces instructions :

1. **New Application**, un nom quelconque.
2. Onglet **OAuth2** → note l'**Application ID** et le **Client Secret**
   (*Reset Secret* pour l'afficher).
3. Toujours dans **OAuth2**, section *Redirects*, ajoute exactement :
   `https://logs.mon-serveur.fr/api/auth/discord/callback`
   — avec le vrai domaine, sans barre oblique à la fin.
4. Onglet **Bot** → *Reset Token*, note le jeton.
   Aucun « intent privilégié » n'est nécessaire : le bot ne fait que lire les
   membres et leurs rôles.
5. Invite le bot sur le serveur Discord concerné.

Puis, sur le VPS, ajoute les **deux secrets** — et eux seuls — dans
`/srv/origin-logs/api/.env` :

```bash
DISCORD_CLIENT_SECRET=...
DISCORD_BOT_TOKEN=...
```

```bash
sudo systemctl restart origin-logs
```

Tout le reste — identifiant d'application, identifiant du serveur Discord, rôle
staff, correspondance entre rôles Discord et rôles du panneau — se règle **dans
le panneau**, écran « Liaison Discord », pour qu'un changement de rôles ne
demande pas de toucher au fichier ni de redémarrer.

**Vérification** :

```bash
curl -s https://logs.mon-serveur.fr/api/auth/options
```

Le champ `"discord"` passe à `true` une fois que les deux secrets **et** le
réglage fait dans le panneau sont en place. Tant qu'il est à `false`, le tableau
`"manque"` dit précisément ce qui manque encore — lis-le, il est fait pour ça.

---

## Étape 10 — Vérification finale

Coche les six, dans l'ordre :

```bash
node --version                                              # v22.5+
systemctl is-active origin-logs                             # active
systemctl is-active caddy                                   # active
curl -sI https://logs.mon-serveur.fr | head -1              # HTTP/2 200
curl -s -o /dev/null -w '%{http_code}\n' https://logs.mon-serveur.fr/api/.env
curl -s -o /dev/null -w '%{http_code}\n' https://logs.mon-serveur.fr/api/data/origin-logs.db
```

⚠️ Les **deux dernières doivent afficher 401 ou 404, jamais 200.** Si l'une
répond 200, arrête-toi : la clé serveur et la base de journaux seraient
téléchargeables par n'importe qui. Signale-le à l'humain immédiatement.

Enfin, la suite de tests du produit (elle ne touche pas à la base installée, elle
en crée une temporaire) :

```bash
cd /srv/origin-logs/api && sudo -u origin node test/run.js
```

Elle doit finir par `15 suite(s) au vert.`

---

## Les sauvegardes

La base contient tout : journaux, comptes, rôles, offres.

**Elles sont déjà actives**, sans rien à régler : une copie toutes les 24 h,
les quatorze dernières gardées, dans `api/data/backups/`. Le panneau les liste
dans **Supervision → Sauvegardes** (télécharger, restaurer, supprimer). Deux
réglages, dans `api/.env`, si l'humain veut autre chose :

```bash
BACKUP_EVERY_HOURS=24    # 0 = plus aucune sauvegarde automatique
BACKUP_KEEP=14           # combien on en garde
```

⚠️ **Une sauvegarde qui reste sur la même machine ne protège de rien** — ni d'un
disque perdu, ni d'un VPS résilié. Sors-les :

```bash
# depuis une AUTRE machine, toutes les nuits
rsync -az origin@IP-DU-VPS:/srv/origin-logs/api/data/backups/ ./sauvegardes-origin/
```

---

## Mettre à jour plus tard

Owen enverra une nouvelle archive. `api/.env` et `api/data/` **ne sont pas
dedans** : ils restent en place.

```bash
sudo systemctl stop origin-logs
sudo cp -a /srv/origin-logs/api/data /srv/origin-logs-data-$(date +%F)   # ceinture et bretelles
sudo tar -xzf origin-logs.tar.gz -C /srv/origin-logs
sudo chown -R origin:origin /srv/origin-logs
sudo systemctl start origin-logs
```

Les changements de structure de la base s'appliquent tout seuls au démarrage, et
sont conçus pour ne rien effacer. Vérifie quand même
`journalctl -u origin-logs -n 20 --no-pager` : les migrations s'y annoncent.

---

## Si quelque chose ne marche pas

| Ce que tu vois | Ce que c'est | Ce qu'il faut faire |
|---|---|---|
| `Cannot find module 'node:sqlite'` | Node trop ancien | Reprends l'étape 2. Ne cherche pas de paquet npm de remplacement : il n'y en a pas |
| `SERVER_KEY est vide` au démarrage | `api/.env` absent, illisible, ou lancé depuis le mauvais dossier | `WorkingDirectory` doit être `/srv/origin-logs/api` ; `sudo -u origin cat api/.env` doit fonctionner |
| Le service redémarre en boucle | La vraie erreur est dans le journal | `journalctl -u origin-logs -n 40 --no-pager` |
| `EADDRINUSE` | Le port 8080 est déjà pris | `ss -ltnp \| grep 8080` ; change `PORT=` dans `.env` **et** dans le Caddyfile |
| Connexion refusée en boucle après HTTPS | `SECURE_COOKIE=1` sans HTTPS réel | Le site doit répondre en `https://` *avant* ce réglage |
| Les tentatives de connexion ne sont jamais freinées | `TRUST_PROXY` absent derrière Caddy | Ajoute `TRUST_PROXY=1`, redémarre |
| J'ai changé `.env` et rien ne change | Une variable de même nom est posée dans le service systemd, et systemd gagne | Retire-la du fichier `.service`, `daemon-reload`, redémarre |
| Un fichier privé répond 200 | Grave | Arrête-toi, signale-le à l'humain |
| Le panneau s'affiche mais dit « démonstration » | La page est ouverte en fichier local, pas servie par l'API | Ouvre bien `https://le-domaine`, pas le fichier `index.html` |

---

## Ce qu'il ne faut jamais faire

- **Ouvrir le port 8080 au monde.** L'API ne fait pas de TLS.
- **Mettre la clé serveur ailleurs que dans `api/.env`** côté panneau, et dans
  `server.cfg` côté serveur de jeu. Elle ne va **jamais** dans un fichier
  `config.lua` : celui-ci est « shared », donc téléchargé par chaque joueur qui
  se connecte. Une clé posée là est une clé publique.
- **Faire tourner l'API en `root`.**
- **Versionner ou copier `api/.env` et `api/data/`** dans un dépôt : le premier
  contient les secrets, le second tous les journaux.
- **Supprimer `api/data/origin-logs.db`** pour « repartir propre ». C'est toute
  la mémoire du produit : comptes, rôles, environnements clients, journaux.

---

## Et après ?

L'installation s'arrête ici : le panneau tourne, l'humain a son compte, il
administre la plateforme. Brancher un **serveur de jeu FiveM** dessus est une
autre opération, et elle se fait depuis l'interface — bouton **Fiche
d'installation** sur chaque environnement, qui produit la commande à exécuter sur
le serveur de jeu. Deux documents livrés avec le produit la détaillent, si
besoin : `BRANCHER-SUR-FIVEM.md` et `COMMENT-CA-MARCHE.md`, à la racine du
dossier. `DEPLOIEMENT.md` couvre le reste (captures d'écran, bot Discord,
multi-clients, journalisation de scripts maison).
