# Installer Origin Logs sur un VPS

**Ce fichier est un mode d'emploi destiné à un assistant (Claude) qui a un accès
terminal au VPS.** Colle-le entier dans la conversation et demande-lui de le
suivre.

---

## Pour l'humain — ce qu'il faut avant de commencer

1. **Un VPS** sous Debian 12 / Ubuntu 22.04 ou plus récent, avec `root` ou
   `sudo`. 1 Go de RAM et 10 Go de disque suffisent largement.
2. **Un nom de domaine** pointant sur l'IP du VPS (enregistrement `A`), par
   exemple `logs.mon-serveur.fr`. Sans lui l'installation fonctionne, mais en
   `http://` sur l'IP : bon pour essayer, pas pour s'en servir.
3. **Owen, joignable pendant vingt minutes.** L'installation lui demandera une
   seule chose, une fois : ajouter une clé sur son dépôt, trois clics. C'est ce
   qui permet ensuite au panneau de **se mettre à jour tout seul**, sans que
   personne ait quoi que ce soit à faire.

Rien à acheter, rien d'autre à installer : le produit **n'a aucune dépendance
npm**. Il tourne avec Node seul.

Onze étapes, comptez une demi-heure. Si Owen préfère ne pas donner d'accès à son
dépôt, voyez l'**annexe** à la fin : l'installation se fait alors depuis une
archive, mais les mises à jour redeviennent manuelles.

---

## Instructions à l'assistant

Tu installes un panneau de journalisation pour serveurs FiveM. Suis les étapes
**dans l'ordre**. Chacune se termine par une **vérification** : exécute-la, et
ne passe à la suivante que si elle donne le résultat annoncé.

Quatre règles :

- **N'invente aucune commande ni aucun nom de fichier.** Tout ce dont tu as
  besoin est ici. Si quelque chose manque, dis-le à l'humain plutôt que de
  deviner.
- **Ne modifie pas le code de l'application.** Si une étape échoue, la cause est
  dans « Si quelque chose ne marche pas », à la fin.
- **Arrête-toi et demande** chaque fois que tu vois 🛑.
- **Montre à l'humain, en clair, les secrets** que l'installation produit. Le
  mot de passe du compte n'est affiché qu'une fois.

---

## Ce que tu installes, en trois phrases

Une API Node qui reçoit les journaux d'un ou plusieurs serveurs de jeu FiveM et
les range dans une base SQLite locale, plus une page web qui les affiche. Un
serveur de jeu y dépose ses évènements avec une clé ; une équipe les lit avec un
compte. Tout tient dans un dossier et un processus.

---

## Étape 1 — Node 22

⚠️ **Il faut Node 22.5.0 ou plus.** Le produit utilise `node:sqlite`, qui
n'existe pas avant. Debian 12 livre Node 18 : ça ne suffit pas.

```bash
node --version
```

Si la version est inférieure à `v22.5.0`, ou si la commande n'existe pas :

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git curl
```

**Vérification** :

```bash
node --version    # v22.x, avec x >= 5
node -e "require('node:sqlite'); console.log('sqlite disponible')"
```

Si la seconde commande échoue, la version est trop ancienne — ne cherche pas de
paquet npm de remplacement, il n'y en a pas. Reprends l'installation de Node.

**Aucun `npm install` n'est nécessaire**, à aucun moment. Si tu es tenté de le
lancer, c'est que tu t'es trompé de dossier.

---

## Étape 2 — L'utilisateur et la clé de déploiement

L'API ne doit pas tourner en `root`, et c'est cet utilisateur-là qui portera la
clé de lecture du dépôt.

```bash
sudo useradd --system --create-home --home-dir /var/lib/origin-logs \
             --shell /usr/sbin/nologin origin || true
sudo -u origin -H mkdir -p /var/lib/origin-logs/.ssh
sudo -u origin -H chmod 700 /var/lib/origin-logs/.ssh
sudo -u origin -H ssh-keygen -t ed25519 -N '' \
     -f /var/lib/origin-logs/.ssh/id_ed25519 -C "vps-origin-logs"
sudo -u origin -H cat /var/lib/origin-logs/.ssh/id_ed25519.pub
```

⚠️ **`-H` n'est pas décoratif.** Sans lui, `sudo` garde le `HOME` de root et ssh
ira chercher la clé dans `/root/.ssh`, où elle n'est pas. Garde-le sur **toutes**
les commandes `sudo -u origin` de ce document.

🛑 **Donne à Owen la ligne affichée** (elle commence par `ssh-ed25519` et finit
par `vps-origin-logs`). Il l'ajoute sur GitHub :

> `github.com/OwenMtp1/origin-logs` -> **Settings** -> **Deploy keys** ->
> **Add deploy key** -> coller -> **laisser « Allow write access » DÉCOCHÉ**

Cette machine doit pouvoir **lire** les mises à jour, jamais rien renvoyer.

**Vérification**, une fois qu'Owen a confirmé :

```bash
sudo -u origin -H ssh -o StrictHostKeyChecking=accept-new -T git@github.com
```

GitHub doit répondre quelque chose comme :

```
Hi OwenMtp1/origin-logs! You've successfully authenticated,
but GitHub does not provide shell access.
```

**C'est le résultat attendu** — ce n'est pas une erreur. S'il répond
`Permission denied (publickey)`, la clé n'est pas encore posée côté GitHub :
attends, ne regénère pas la clé.

---

## Étape 3 — Cloner

```bash
sudo mkdir -p /srv/origin-logs
sudo chown origin:origin /srv/origin-logs
sudo -u origin -H git clone git@github.com:OwenMtp1/origin-logs.git /srv/origin-logs
```

**Vérification** — ces quatre chemins doivent exister :

```bash
ls /srv/origin-logs/api/server.js \
   /srv/origin-logs/api/setup.js \
   /srv/origin-logs/index.html \
   /srv/origin-logs/maj/mise-a-jour.sh
```

⚠️ **Et l'adresse du dépôt doit commencer par `git@github.com:`**, pas par
`https://` :

```bash
sudo -u origin -H git -C /srv/origin-logs remote -v
```

Un clone en `https` fonctionne au moment du clone — le dépôt est accessible avec
les identifiants d'Owen — puis **les mises à jour échouent toutes**, parce que la
clé de déploiement ne sert qu'en SSH. Et elles échouent en silence, dans un
journal que personne ne lit. Si l'adresse est en `https`, corrige-la :

```bash
sudo -u origin -H git -C /srv/origin-logs remote set-url origin \
     git@github.com:OwenMtp1/origin-logs.git
```

---

## Étape 4 — Mise en route

Une seule commande : elle génère la clé serveur, écrit `api/.env`, crée la base
et le premier compte.

Remplace `NOM` par le pseudo avec lequel l'humain se connectera — 3 caractères
minimum, demande-le-lui s'il ne l'a pas dit :

```bash
cd /srv/origin-logs/api
sudo -u origin -H node setup.js NOM
```

🛑 **La sortie affiche deux choses qui ne seront plus jamais affichées :**

```
  │  Clé serveur   (nouvelle)
  │  9d95dda991e6e6d635cd6bdfbff93756b19fdfe69bbdf4d9
  │
  │  Compte fondateur   NOM
  │  Mot de passe       oS2iJMklzkR9apHF
```

**Recopie-les intégralement à l'humain et dis-lui de les noter maintenant.** La
clé serveur reste lisible dans `api/.env` ; le mot de passe, non — il n'est
stocké nulle part en clair.

**Vérification** :

```bash
sudo -u origin -H stat -c '%a %n' /srv/origin-logs/api/.env   # doit afficher 600
sudo -u origin -H node staff.js list                          # doit lister le compte
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

⚠️ **Aucun secret dans ce fichier.** Tout est déjà dans `api/.env`, en `600` et
illisible par les autres utilisateurs ; un fichier systemd, lui, est lisible par
tout le monde.

À retenir pour plus tard : quand une variable est définie aux deux endroits,
**c'est systemd qui gagne** — `api/.env` ne remplace jamais une variable déjà
posée dans l'environnement. C'est la cause classique de « j'ai changé le fichier
et rien ne bouge ».

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now origin-logs
```

**Vérification** :

```bash
systemctl is-active origin-logs                              # active
curl -s http://127.0.0.1:8080/api/auth/options               # du JSON
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/   # 200
```

La réponse de `/api/auth/options` ressemble à ceci — c'est normal, Discord n'est
pas encore branché :

```json
{"discord":false,"manque":["identifiant d’application", "..."],"motDePasse":true}
```

Si le service ne démarre pas : `journalctl -u origin-logs -n 40 --no-pager`.

---

## Étape 6 — Le domaine et HTTPS

🛑 **Demande le nom de domaine** qu'il a fait pointer sur ce VPS. S'il n'en a
pas, dis-le-lui franchement : l'installation restera en `http://` sur l'IP, ce
qui suffit pour essayer mais **pas** pour s'en servir — les mots de passe et le
cookie de session circuleraient en clair, et la connexion Discord ne
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

`/etc/caddy/Caddyfile` — remplace par le vrai domaine :

```
logs.mon-serveur.fr {
    reverse_proxy 127.0.0.1:8080
}
```

```bash
sudo systemctl reload caddy
```

**Vérification** :

```bash
curl -sI https://logs.mon-serveur.fr | head -1     # HTTP/2 200
```

Si le certificat échoue, c'est presque toujours l'une de deux choses : le
domaine ne pointe pas encore sur cette IP (`dig +short LE-DOMAINE` doit rendre
l'IP du VPS), ou le port 80 est fermé — Let's Encrypt en a besoin.

### Le pare-feu

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw --force enable
sudo ufw status
```

⚠️ **N'ouvre pas le 8080.** Il ne doit être joignable que depuis la machine.

---

## Étape 7 — Reboucler la configuration sur HTTPS

Le site répond en HTTPS : quatre réglages doivent le savoir. Ajoute-les à
`/srv/origin-logs/api/.env` :

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
- `PUBLIC_URL` — fige l'adresse publique : elle sert à composer l'URL de retour
  de la connexion Discord et la fiche d'installation remise aux clients.
- `HOST=127.0.0.1` — l'API cesse d'écouter sur l'extérieur.

```bash
sudo systemctl restart origin-logs
```

**Vérification** :

```bash
systemctl is-active origin-logs
curl -sI https://logs.mon-serveur.fr | head -1     # HTTP/2 200
journalctl -u origin-logs -n 20 --no-pager | grep écoute   # doit dire 127.0.0.1
```

---

## Étape 8 — Ouvrir l'administration

Le compte créé à l'étape 4 est fondateur de l'espace de départ. Pour qu'il
administre **la plateforme** — créer des environnements clients, composer les
offres, gérer l'équipe — il faut le dire explicitement :

```bash
cd /srv/origin-logs/api
sudo -u origin -H node staff.js platform NOM
```

⚠️ Ce droit **ne s'accorde pas depuis l'interface** : sinon le fondateur d'un
serveur client pourrait se hisser au-dessus de tous les autres.

**Vérification** :

```bash
sudo -u origin -H node staff.js list    # la colonne ÉTAT doit afficher PLATEFORME
```

🛑 **Dis à l'humain d'ouvrir `https://logs.mon-serveur.fr` et de se connecter**
avec le pseudo et le mot de passe de l'étape 4. Il doit arriver sur
**« Supervision »**, avec dans la barre de gauche : Supervision, Liste des
environnements, Offres, Équipe & rôles, Journal d'administration. C'est la
preuve que tout fonctionne.

S'il n'a pas noté le mot de passe, il n'est pas perdu :

```bash
sudo -u origin -H node staff.js passwd NOM    # en génère un nouveau et l'affiche
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
2. Onglet **OAuth2** -> note l'**Application ID** et le **Client Secret**
   (*Reset Secret* pour l'afficher).
3. Toujours dans **OAuth2**, section *Redirects*, ajouter exactement :
   `https://logs.mon-serveur.fr/api/auth/discord/callback`
   — le vrai domaine, sans barre oblique à la fin.
4. Onglet **Bot** -> *Reset Token*, noter le jeton. Aucun « intent privilégié »
   n'est nécessaire : le bot ne fait que lire les membres et leurs rôles.
5. Inviter le bot sur le serveur Discord concerné.

Puis, sur le VPS, **les deux secrets — et eux seuls** — dans
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
demande ni de toucher au fichier ni de redémarrer.

**Vérification** :

```bash
curl -s https://logs.mon-serveur.fr/api/auth/options
```

Le champ `"discord"` passe à `true` quand les deux secrets **et** le réglage
fait dans le panneau sont en place. Tant qu'il est à `false`, le tableau
`"manque"` dit précisément ce qui manque encore — lis-le, il est fait pour ça.

---

## Étape 10 — Les mises à jour automatiques

Le dossier est déjà une copie du dépôt : il ne reste qu'à poser le minuteur.

```bash
sudo cp /srv/origin-logs/maj/maj.conf.exemple /etc/origin-logs-maj.conf
sudo cp /srv/origin-logs/maj/origin-logs-maj.service /etc/systemd/system/
sudo cp /srv/origin-logs/maj/origin-logs-maj.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now origin-logs-maj.timer
```

🛑 **Une question pour Owen, une seule.** Veut-il que cette machine prenne
**chaque commit** qu'il pousse (`SUIVRE=branche`, la valeur par défaut, pratique
tant que c'est un serveur d'essai), ou seulement les versions qu'il publie
explicitement (`SUIVRE=etiquette`) ? C'est un mot à changer dans
`/etc/origin-logs-maj.conf`, rien d'autre.

**Vérification** :

```bash
systemctl list-timers origin-logs-maj --no-pager    # la prochaine exécution s'affiche
sudo /srv/origin-logs/maj/mise-a-jour.sh            # à la main, tout de suite
```

La dernière commande doit afficher soit `déjà à jour (…) — rien à faire.`, soit
le détail d'une mise à jour qui s'est faite. Ensuite, pour voir ce que le
minuteur raconte : `journalctl -u origin-logs-maj -n 30 --no-pager`.

### Ce que fait le script, dans l'ordre

1. Il regarde ce qui existe dans le dépôt.
2. Si c'est identique à ce qui tourne, **il s'arrête** — pas de redémarrage
   inutile toutes les dix minutes.
3. Sinon il pose le nouveau code et **joue la suite de tests**. Elle monte ses
   propres serveurs sur d'autres ports et sa propre base : elle ne dérange pas
   le panneau qui tourne. Si elle échoue, **la mise à jour est annulée**.
4. Il redémarre le service, puis **vérifie que le panneau répond vraiment**.
5. S'il ne répond pas dans les vingt secondes, **il remet la version
   précédente** et redémarre.

⚠️ Ce cinquième point est le seul qui compte vraiment : un déploiement
automatique sans retour arrière n'est pas un déploiement automatique, c'est une
panne différée — personne ne voit une mauvaise version poussée à trois heures du
matin avant le lendemain.

⚠️ Le script fait `reset --hard` : cette machine ne doit rien porter en propre.
Si tu modifies un fichier ici « pour dépanner », il sera écrasé à la mise à jour
suivante, et c'est voulu — sans quoi toutes les mises à jour finiraient par
échouer en silence. Un correctif se fait chez Owen, jamais ici.

---

## Étape 11 — Vérification finale

Sept contrôles, dans l'ordre :

```bash
node --version                                              # v22.5+
systemctl is-active origin-logs                             # active
systemctl is-active caddy                                   # active
systemctl is-active origin-logs-maj.timer                   # active
curl -sI https://logs.mon-serveur.fr | head -1              # HTTP/2 200
curl -s -o /dev/null -w '%{http_code}\n' https://logs.mon-serveur.fr/api/.env
curl -s -o /dev/null -w '%{http_code}\n' https://logs.mon-serveur.fr/api/data/origin-logs.db
```

⚠️ Les **deux dernières doivent afficher 401 ou 404, jamais 200.** Si l'une
répond 200, arrête-toi : la clé serveur et la base de journaux seraient
téléchargeables par n'importe qui. Signale-le immédiatement.

Enfin la suite de tests du produit — elle ne touche pas à la base installée,
elle en crée une temporaire :

```bash
cd /srv/origin-logs/api && sudo -u origin -H node test/run.js
```

Elle doit finir par `15 suite(s) au vert.`

---

## Les sauvegardes

La base contient tout : journaux, comptes, rôles, offres.

**Elles sont déjà actives**, sans rien à régler : une copie toutes les 24 h, les
quatorze dernières gardées, dans `api/data/backups/`. Le panneau les liste dans
**Supervision -> Sauvegardes** (télécharger, restaurer, supprimer). Deux
réglages, dans `api/.env`, si l'humain veut autre chose :

```bash
BACKUP_EVERY_HOURS=24    # 0 = plus aucune sauvegarde automatique
BACKUP_KEEP=14           # combien on en garde
```

⚠️ **Une sauvegarde qui reste sur la même machine ne protège de rien** — ni d'un
disque perdu, ni d'un VPS résilié, ni du jour où l'on cesse de travailler avec
l'hébergeur.

🛑 **C'est OWEN qui doit détenir la copie hors-site, pas seulement l'hébergeur du
VPS.** La règle : la sauvegarde est *tirée* par la machine d'Owen depuis le VPS,
elle n'est pas *poussée* par le VPS vers un endroit que l'hébergeur choisirait.
Ainsi, quoi qu'il arrive au VPS, Owen garde des journaux à jour et peut
réinstaller ailleurs en une heure.

À faire **sur une machine qui appartient à Owen** (son poste, un autre serveur à
lui), pas sur le VPS d'installation :

```bash
# toutes les nuits, la machine d'Owen VIENT CHERCHER les sauvegardes
rsync -az origin@IP-DU-VPS:/srv/origin-logs/api/data/backups/ ~/sauvegardes-origin-logs/
```

Owen a besoin d'un accès SSH en lecture au VPS pour ça (une clé publique à lui,
posée dans `~origin/.ssh/authorized_keys`). Cet accès est aussi ce qui lui
permet, le jour venu, de tout récupérer sans dépendre de personne.

---

## Mettre à jour plus tard

**Rien à faire** : la machine s'en charge toute seule, et
`journalctl -u origin-logs-maj` raconte ce qui s'est passé. Pour forcer tout de
suite : `sudo /srv/origin-logs/maj/mise-a-jour.sh`.

Les changements de structure de la base s'appliquent au démarrage et sont écrits
pour ne rien effacer. `api/.env` et `api/data/` sont ignorés par git : une mise à
jour ne peut ni les écraser ni les lire.

---

## Si quelque chose ne marche pas

| Ce que tu vois | Ce que c'est | Ce qu'il faut faire |
|---|---|---|
| `Cannot find module 'node:sqlite'` | Node trop ancien | Reprends l'étape 1. Aucun paquet npm ne remplace ça |
| `Permission denied (publickey)` | La clé de déploiement n'est pas encore posée, **ou** un `sudo -u origin` sans `-H` | Vérifie le `-H`. Sinon attends qu'Owen ajoute la clé ; ne la regénère pas |
| `could not read Username for 'https://github.com'` | Le dépôt a été cloné en `https` : la clé de déploiement ne sert qu'en SSH | `git remote set-url origin git@github.com:OwenMtp1/origin-logs.git` (voir étape 3) |
| `SERVER_KEY est vide` au démarrage | `api/.env` absent, illisible, ou lancé du mauvais dossier | `WorkingDirectory` doit être `/srv/origin-logs/api` ; `sudo -u origin -H cat api/.env` doit fonctionner |
| Le service redémarre en boucle | La vraie erreur est dans le journal | `journalctl -u origin-logs -n 40 --no-pager` |
| `EADDRINUSE` | Le port 8080 est déjà pris | `ss -ltnp \| grep 8080` ; change `PORT=` dans `.env` **et** dans le Caddyfile |
| Connexion refusée en boucle après HTTPS | `SECURE_COOKIE=1` sans HTTPS réel | Le site doit répondre en `https://` *avant* ce réglage |
| Les tentatives de connexion ne sont jamais freinées | `TRUST_PROXY` absent derrière Caddy | Ajoute `TRUST_PROXY=1`, redémarre |
| J'ai changé `.env` et rien ne change | Une variable de même nom est posée dans le service systemd, et systemd gagne | Retire-la du `.service`, `daemon-reload`, redémarre |
| La mise à jour dit « LES TESTS ÉCHOUENT » | Le code poussé est cassé — rien n'a bougé, le filet a joué | Préviens Owen. La version précédente tourne toujours |
| Le journal dit « RETOUR ARRIÈRE » | La nouvelle version ne répondait plus ; l'ancienne a été remise | Préviens Owen avec les 30 dernières lignes du journal |
| Un fichier privé répond 200 | Grave | Arrête-toi, signale-le |
| Le panneau dit « démonstration » | La page est ouverte en fichier local, pas servie par l'API | Ouvre `https://le-domaine`, pas le fichier `index.html` |

---

## Ce qu'il ne faut jamais faire

- **Ouvrir le port 8080 au monde.** L'API ne fait pas de TLS.
- **Mettre la clé serveur ailleurs que dans `api/.env`** côté panneau, et dans
  `server.cfg` côté serveur de jeu. Elle ne va **jamais** dans un `config.lua` :
  ce fichier est « shared », donc téléchargé par chaque joueur qui se connecte.
  Une clé posée là est une clé publique.
- **Faire tourner l'API en `root`.**
- **Copier `api/.env` ou `api/data/` ailleurs** : le premier contient les
  secrets, le second tous les journaux.
- **Supprimer `api/data/origin-logs.db`** pour « repartir propre ». C'est toute
  la mémoire du produit : comptes, rôles, environnements clients, journaux.
- **Modifier un fichier du produit sur ce VPS.** Il sera écrasé à la prochaine
  mise à jour, et entre-temps cette machine ne ferait plus tourner le même code
  que les autres. Ce qui doit changer, change chez Owen.

---

## Annexe — installer sans accès au dépôt

Si Owen préfère ne pas poser de clé de déploiement, il enverra une archive
`origin-logs.tar.gz`. Remplace alors les étapes 2 et 3 par :

```bash
sudo useradd --system --home /srv/origin-logs --shell /usr/sbin/nologin origin || true
sudo mkdir -p /srv/origin-logs
sudo tar -xzf origin-logs.tar.gz -C /srv/origin-logs
sudo chown -R origin:origin /srv/origin-logs
```

Puis **saute l'étape 10** : sans dépôt, pas de mise à jour automatique. Chaque
mise à jour se fera à la main, en redécompressant l'archive suivante par-dessus
(`api/.env` et `api/data/` n'y sont pas, ils restent en place) :

```bash
sudo systemctl stop origin-logs
sudo tar -xzf origin-logs.tar.gz -C /srv/origin-logs
sudo chown -R origin:origin /srv/origin-logs
sudo systemctl start origin-logs
```

Le reste du document ne change pas. Et l'étape 10 peut se brancher plus tard
sans réinstaller : il suffit alors de rattacher le dossier au dépôt.

---

## Et après ?

L'installation s'arrête ici : le panneau tourne, l'humain a son compte, il
administre la plateforme, et la machine se met à jour toute seule.

Brancher un **serveur de jeu FiveM** dessus est une autre opération, et elle se
fait depuis l'interface — bouton **Fiche d'installation** sur chaque
environnement, qui produit la commande à exécuter sur le serveur de jeu. Deux
documents livrés avec le produit la détaillent : `BRANCHER-SUR-FIVEM.md` et
`COMMENT-CA-MARCHE.md`, à la racine du dossier. `DEPLOIEMENT.md` couvre le reste
(captures d'écran, bot Discord, multi-clients, journalisation de scripts
maison).
