# Brancher le panneau sur votre serveur FiveM — guide débutant

Ce guide suppose **zéro connaissance**. Il est écrit pour le cas le plus
courant : vous louez un **VPS** (une machine à vous, avec un accès SSH), et
votre serveur FiveM tourne déjà dessus.

Vous n'avez **rien à savoir faire d'autre que copier-coller**. Comptez 30 à
45 minutes la première fois.

> Pour l'installation détaillée (HTTPS, reverse proxy, plusieurs serveurs,
> réglages fins), voir `DEPLOIEMENT.md`. Ici, on va au plus simple.

---

## Avant de commencer : de quoi on parle

Vous avez **deux programmes** qui vont vivre côte à côte sur la même machine :

| | Ce que c'est | Où ça tourne |
|---|---|---|
| **Le serveur FiveM** | votre serveur de jeu, celui que vous avez déjà | votre VPS |
| **Le panneau** | un petit site web qui reçoit et affiche les logs | votre VPS, à côté |

Entre les deux, on ajoute un **dossier de ressource** (`origin_logs`) dans
votre serveur FiveM. Ce dossier écoute ce qui se passe en jeu et l'envoie au
panneau.

Les deux programmes sont sur la **même machine**, donc ils se parlent par
`127.0.0.1` (« moi-même »). Rien à ouvrir sur Internet pour que ça marche.

Trois étapes :

1. faire tourner le panneau sur le VPS ;
2. poser le dossier `origin_logs` dans le serveur FiveM ;
3. écrire trois lignes dans `server.cfg`.

---

## Étape 0 — Se connecter à son VPS

Depuis votre PC, ouvrez **PowerShell** (Windows) ou **Terminal** (Mac) et
tapez, en remplaçant par les infos données par votre hébergeur :

```bash
ssh root@123.45.67.89
```

Il demande le mot de passe (rien ne s'affiche quand vous tapez, c'est normal),
puis vous voilà « dans » la machine. Tout ce qui suit se tape là.

---

## Étape 1 — Installer Node (le moteur du panneau)

Le panneau a besoin de **Node 22.5 ou plus récent**. Vérifiez ce qui est
installé :

```bash
node --version
```

- Si ça affiche `v22.5.0` ou plus → passez à l'étape 2.
- Si ça affiche autre chose, ou « command not found » → installez-le :

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs git
node --version
```

(Ces commandes valent pour Debian et Ubuntu, qui équipent la grande majorité
des VPS. Sur une autre distribution, demandez la version 22 à votre
gestionnaire de paquets.)

> ⚠️ La version par défaut des dépôts Debian/Ubuntu est trop ancienne : le
> panneau utilise la base de données intégrée à Node 22, absente avant. C'est
> pour ça qu'on passe par NodeSource.

---

## Étape 2 — Récupérer et démarrer le panneau

```bash
cd /srv
git clone https://github.com/OwenMtp1/BD-Report.git
cd BD-Report
git checkout claude/origin-roleplay-logs-panel-kym4bf
cd origin-logs/api
```

Puis créez votre compte — **remplacez `VotrePseudo`** par le pseudo avec lequel
vous voulez vous connecter :

```bash
npm run setup VotrePseudo
```

L'écran affiche un cadre avec :

- **une clé serveur** (une longue suite de lettres et chiffres) ;
- **un mot de passe**.

📌 **Copiez les deux dans un bloc-notes tout de suite.** Le mot de passe n'est
stocké nulle part en clair : si vous le perdez, il faut le réinitialiser.

Démarrez le panneau :

```bash
npm start
```

Il affiche quelque chose comme `http://localhost:8080`. Laissez la fenêtre
ouverte pour l'instant — on la rendra permanente à l'étape 5.

---

## Étape 3 — Poser la ressource dans le serveur FiveM

Ouvrez **une deuxième fenêtre SSH** (le panneau tourne dans la première).

Trouvez le dossier `resources` de votre serveur FiveM. C'est celui qui contient
déjà vos autres ressources (`[core]`, `es_extended`, `qb-core`…). Souvent :

```
/home/fivem/server-data/resources
```

Copiez-y le dossier, **sous le nom `origin_logs`** (le nom compte) :

```bash
cp -r /srv/BD-Report/origin-logs/resource /home/fivem/server-data/resources/origin_logs
```

Si votre chemin est différent, remplacez la partie de droite par le vôtre.
Pour le retrouver :

```bash
find / -name "server.cfg" 2>/dev/null
```

---

## Étape 4 — Les trois lignes dans `server.cfg`

Ouvrez le `server.cfg` de votre serveur FiveM :

```bash
nano /home/fivem/server-data/server.cfg
```

Descendez tout en bas (flèche ↓) et collez ceci, en remplaçant
`COLLEZ-VOTRE-CLE-ICI` par la **clé serveur** notée à l'étape 2 :

```cfg
set origin_logs_url "http://127.0.0.1:8080"
set origin_logs_key "COLLEZ-VOTRE-CLE-ICI"
set origin_logs_name "origin-1"

ensure baseevents
ensure origin_logs
```

Pour enregistrer dans nano : **Ctrl+O**, puis **Entrée**, puis **Ctrl+X**.

### ⚠️ Les deux pièges à ne pas faire

**1. La clé va dans `server.cfg`, JAMAIS dans `config.lua`.**
`config.lua` est un fichier que **chaque joueur télécharge** en se connectant à
votre serveur. Une clé posée là-dedans est publique : n'importe quel joueur
pourrait écrire de faux logs chez vous, ou noyer les vrais pour cacher ce qu'il
a fait.

**2. On écrit `set`, pas `setr`.**
Une seule lettre de différence, mais `setr` **envoie la valeur à tous les
clients** — ça remettrait la clé exactement là où on vient d'éviter de la
mettre. Si vous voyez `setr origin_logs_key` quelque part, corrigez-le.

> 💡 Encore plus propre : mettez les trois `set` dans un fichier à part,
> `secrets.cfg`, et dans `server.cfg` écrivez seulement `exec secrets.cfg`.
> Comme ça, si vous partagez ou sauvegardez votre `server.cfg` un jour, la clé
> ne part pas avec.

Redémarrez votre serveur FiveM.

---

## Étape 5 — Vérifier que ça marche

Dans la **console de votre serveur FiveM**, tapez :

```
origin_logs_test
```

Il doit répondre `[origin_logs] évènement de test envoyé`.

Ouvrez maintenant le panneau (étape 6) : la ligne doit apparaître dans la
rubrique **« Action staff »**. Si elle y est, tout est branché. 🎉

### Si rien n'arrive

Regardez la console FiveM au démarrage :

| Message | Ce qu'il faut faire |
|---|---|
| `Aucune clé d'ingestion` | la ligne `set origin_logs_key` manque ou est vide |
| `La clé est restée « CHANGEZ-MOI »` | vous avez collé l'exemple, pas votre vraie clé |
| rien du tout, aucune ligne `origin_logs` | le dossier n'est pas au bon endroit, ou `ensure origin_logs` manque |

Et côté panneau, la fenêtre où tourne `npm start` affiche les refus.

---

## Étape 6 — Voir le panneau depuis votre PC

Pour l'instant le panneau n'écoute que la machine. Pour le regarder depuis chez
vous, le plus sûr est un **tunnel SSH** : depuis votre PC, dans PowerShell ou
Terminal :

```bash
ssh -L 8080:127.0.0.1:8080 root@123.45.67.89
```

Laissez cette fenêtre ouverte, puis ouvrez `http://localhost:8080` dans votre
navigateur. Connectez-vous avec le pseudo et le mot de passe de l'étape 2.

Rien n'est exposé sur Internet : c'est parfait pour tester seul.

> ⚠️ **Avant de donner l'accès à votre staff**, il faut un vrai nom de domaine
> et du **HTTPS** — sans quoi les mots de passe circulent en clair sur le
> réseau. La marche à suivre (Caddy en 3 lignes, ou Nginx) est dans
> `DEPLOIEMENT.md`, section 2. N'ouvrez pas le port 8080 sur Internet tel quel.

---

## Étape 7 — Que le panneau survive à la fermeture de la fenêtre

Tant que le panneau tourne avec `npm start`, il s'arrête dès que vous fermez la
fenêtre SSH. Pour qu'il démarre tout seul, y compris après un redémarrage du
VPS :

```bash
nano /etc/systemd/system/origin-logs.service
```

Collez ceci, en remplaçant la clé :

```ini
[Unit]
Description=Origin Roleplay — panneau de logs
After=network.target

[Service]
Type=simple
WorkingDirectory=/srv/BD-Report/origin-logs/api
Environment=SERVER_KEY=COLLEZ-VOTRE-CLE-ICI
Environment=PORT=8080
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Ctrl+O, Entrée, Ctrl+X. Puis :

```bash
systemctl enable --now origin-logs
systemctl status origin-logs
```

Vous pouvez fermer la fenêtre SSH : le panneau tourne tout seul. Pour voir ce
qu'il raconte : `journalctl -u origin-logs -f` (Ctrl+C pour sortir).

---

## Et ensuite ?

Une fois que les logs arrivent, tout se règle **depuis le panneau**, plus en
ligne de commande :

- **Gérer l'équipe** — ajouter vos modérateurs et choisir ce que chacun voit ;
- **Liaison Discord** — au lieu de mots de passe, le staff se connecte avec
  Discord et ses rôles Discord décident de ses droits (voir `DEPLOIEMENT.md`,
  section 1 bis) ;
- **Bot Discord** — recopier les logs en direct dans des salons Discord, un
  salon par rubrique (voir `bot/README.md`) ;
- `resource/config.lua` — couper les rubriques qui ne vous intéressent pas,
  régler l'anticheat, les zones protégées, les captures d'écran. Ce fichier-là
  n'a **rien de secret** : c'est le bon endroit pour les réglages de jeu.

Si votre serveur utilise un framework que la ressource ne reconnaît pas,
`resource/EXEMPLES.md` donne, rubrique par rubrique, la ligne à ajouter dans
vos propres scripts.
