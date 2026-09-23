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
2. l'ouvrir depuis votre PC ;
3. coller **une commande** que le panneau vous donne — elle fait le reste.

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

## Étape 3 — Ouvrir le panneau depuis votre PC

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

## Étape 4 — Brancher le serveur FiveM : **une seule commande**

C'est le panneau qui prépare la commande. Vous n'avez rien à recopier à la
main, et surtout pas la clé.

**a.** Donnez-vous le droit de gérer les espaces (une fois pour toutes). Dans
la fenêtre SSH, dans le dossier `api`, puis reconnectez-vous au panneau :

```bash
node staff.js platform VotrePseudo on
```

**b.** Dans le panneau : colonne de gauche → **Espaces de logs** → sur la carte
de votre serveur, bouton **Fiche d'installation** → **Générer la commande
d'installation**.

Le panneau affiche une ligne qui ressemble à ça :

```bash
bash <(curl -fsSL https://votre-panneau/install) ORG-4F2K-9BQX
```

**c.** Collez-la dans votre fenêtre SSH, sur la machine du serveur FiveM.
C'est tout. Le script :

1. trouve tout seul votre `server.cfg` ;
2. installe le dossier `origin_logs` dans vos `resources` ;
3. écrit la clé dans un fichier `secrets.cfg` que vous seul pouvez lire ;
4. ajoute les lignes qu'il faut dans `server.cfg` (en gardant une copie de
   l'original, au cas où) ;
5. vous dit quoi faire ensuite.

Puis **redémarrez votre serveur FiveM**.

### Ce qu'il faut savoir sur ce code

- Il ne vaut **qu'une seule fois** et **quelques heures**. C'est voulu : cette
  ligne-là se colle dans un Discord, reste dans un historique de terminal,
  traîne dans un ticket. Un code qui a servi ne sert plus à rien ; la clé, elle,
  ouvrirait vos journaux jusqu'à ce que vous la changiez.
- Si vous avez **plusieurs serveurs**, créez un espace par serveur et générez
  un code pour chacun. Chaque clé n'ouvre que son espace.
- Vous pouvez **relancer la commande** (avec un nouveau code) autant de fois
  que vous voulez : elle ne duplique rien, elle met à jour.
- Si le script trouve **plusieurs `server.cfg`**, il ne devine pas : il les
  liste et vous demande de relancer en ajoutant le bon à la fin de la ligne.

---

## Étape 5 — Vérifier que ça marche

Dans la **console de votre serveur FiveM**, tapez :

```
origin_logs_test
```

Il doit répondre `[origin_logs] évènement de test envoyé`.

Dans le panneau, la ligne doit apparaître dans la rubrique **« Action staff »**.
Si elle y est, tout est branché. 🎉

### Si rien n'arrive

| Message dans la console FiveM | Ce qu'il faut faire |
|---|---|
| `Aucune clé d'ingestion` | le `exec secrets.cfg` manque dans `server.cfg` |
| `La clé est restée « CHANGEZ-MOI »` | une vieille clé d'exemple traîne : relancez la commande |
| rien du tout, aucune ligne `origin_logs` | `ensure origin_logs` manque, ou le dossier n'est pas dans `resources` |

Côté panneau, **Supervision → Vérifier** teste chaque espace et dit ce qui
cloche.

---

## Étape 6 — Que le panneau survive à la fermeture de la fenêtre

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

---

## Annexe — le faire à la main

Si vous préférez tout poser vous-même, ou si le script ne convient pas à votre
hébergement, voici les trois gestes qu'il fait à votre place.

**1. Copier le dossier**, sous le nom exact `origin_logs` :

```bash
cp -r /srv/BD-Report/origin-logs/resource /chemin/vers/resources/origin_logs
```

**2. Créer un fichier `secrets.cfg`** à côté de `server.cfg` (la clé est celle
affichée par `npm run setup`, ou dans la fiche d'installation du panneau) :

```cfg
set origin_logs_url  "http://127.0.0.1:8080"
set origin_logs_key  "VOTRE-CLÉ"
set origin_logs_name "origin-1"
```

**3. Ajouter à la fin de `server.cfg`** :

```cfg
exec secrets.cfg
ensure baseevents
ensure origin_logs
```

### ⚠️ Les deux pièges

**La clé va dans `secrets.cfg` (ou `server.cfg`), JAMAIS dans `config.lua`.**
`config.lua` est **téléchargé par chaque joueur** qui se connecte. Une clé
posée là-dedans est publique : n'importe qui pourrait écrire de faux logs chez
vous, ou noyer les vrais pour cacher ce qu'il a fait.

**On écrit `set`, pas `setr`.** Une lettre de différence, mais `setr` **envoie
la valeur à tous les clients** — ça remettrait la clé exactement là où on vient
d'éviter de la mettre.

---

## Annexe — le message à envoyer à votre client

Quand vous vendez un espace, le client n'a besoin de **rien lire** : une
commande et deux phrases suffisent. Voici le message type, à copier tel quel
en remplaçant la ligne `bash …` par celle que le panneau vous a donnée.

> Bonjour,
>
> Votre espace de logs est prêt. Pour brancher votre serveur, connectez-vous
> en SSH à la machine où tourne votre serveur FiveM et collez cette ligne :
>
> ```
> bash <(curl -fsSL https://votre-panneau/install) ORG-4F2K-9BQX
> ```
>
> Elle installe tout et vous dit quand c'est fini. Ensuite :
> 1. redémarrez votre serveur FiveM ;
> 2. dans sa console, tapez `origin_logs_test` ;
> 3. la ligne doit apparaître dans votre panneau, rubrique « Action staff ».
>
> Le code ne fonctionne **qu'une fois** et expire dans 6 heures — si vous le
> ratez, demandez-m'en un nouveau, c'est immédiat.
>
> Vos identifiants de connexion au panneau : …

⚠️ **Si votre client n'a pas d'accès SSH** (hébergeur « clic-bouton » avec
seulement un FTP et un bouton Démarrer), la commande ne peut pas s'exécuter :
il n'y a pas de terminal. Donnez-lui alors l'annexe précédente — il dépose le
dossier par FTP et édite `server.cfg` depuis l'éditeur de son hébergeur. C'est
le seul cas où l'on revient au manuel, et il vaut mieux le repérer **avant**
de promettre une installation en une minute.
