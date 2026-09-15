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

Passez ensuite `SECURE_COOKIE=1` et redémarrez le service.

---

## 3. La ressource FiveM

```bash
cp -r origin-logs/resource /chemin/vers/votre-serveur/resources/origin_logs
```

Éditez **`resources/origin_logs/config.lua`** — deux lignes suffisent :

```lua
Config.ApiUrl    = 'http://127.0.0.1:8080'   -- ou https://logs.origin-rp.fr
Config.ServerKey = 'la-cle-generee-a-etape-1'
```

Si le serveur de jeu et le site sont sur la même machine, gardez
`127.0.0.1:8080` : la clé ne sort jamais du serveur.

Dans `server.cfg` :

```cfg
ensure baseevents     # sans lui, pas de morts ni d'éliminations journalisées
ensure origin_logs
```

Redémarrez, puis dans la console du serveur de jeu :

```
origin_logs_test
```

Un évènement doit apparaître dans le panneau, catégorie **Serveur**. S'il
n'arrive pas, la console dit laquelle des trois causes est en jeu : clé
refusée, API injoignable, ou catégorie désactivée dans `config.lua`.

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

Les évènements natifs couvrent connexions, chat, morts, explosions et
détections. Le reste — braquages, drogue, garages, coffres d'organisation —
vit dans **vos** ressources, qui seules savent ce qui s'y passe :

```lua
exports['origin_logs']:Log({
  cat   = 'braquages',          -- voir Config.Categories
  sev   = 'alerte',             -- critique | alerte | notice | info
  actor = source,               -- un id de joueur, ou une table
  target = autreSource,         -- facultatif
  msg   = ('%s a ouvert le coffre du Pacific'):format(GetPlayerName(source)),
  data  = { kind = 'loot', butin = 184200, sacs = 4 },
  res   = 'mon_script_braquage'
})
```

`data` est rendu tel quel dans l'inspecteur : mettez-y tout ce qui aiderait à
trancher un litige trois jours plus tard. `kind` sert aux compteurs du dossier
joueur (`join`, `kill`, `death`).

---

## Sauvegarde

La base est un seul fichier. Avec le service arrêté, copiez-le ; à chaud,
préférez :

```bash
sqlite3 /srv/origin-logs/api/data/origin-logs.db ".backup '/sauvegardes/logs-$(date +%F).db'"
```

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
