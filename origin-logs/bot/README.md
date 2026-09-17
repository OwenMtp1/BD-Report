# Bot Discord — Origin Logs

Il reporte les journaux du panneau dans Discord, **un salon par rubrique**,
rangés en catégories comme dans le panneau.

```
📁 MODÉRATION          📁 JOUEURS            📁 ARGENT & BIENS
  #bannissement          #connexion            #transactions-et-coffres
  #avertissement         #deconnexion          #items-au-sol
  #anticheat             #ecran-du-joueur      #immobilier
  #logs-des-reports      #mort-joueur
```

Aucune dépendance : Node 22.5 et rien d'autre.

---

## Ce qu'il fait, et ce qu'il ne fait pas

Il **lit** le panneau et **écrit** dans Discord. C'est tout.

⚠️ **Il n'accepte aucune commande.** Un bot qui ferait `!ban` devrait
authentifier chaque personne dans Discord, vérifier ses droits, et
refaire tout le système de rôles du panneau — qui existe déjà et qui, lui,
journalise chaque geste. Le bot rapporte ; le panneau décide.

⚠️ **Il ne supprime jamais un salon.** Un salon porte l'historique de
modération du serveur : c'est au staff d'en décider, pas à un programme.

---

## Installation

### 1. Créer l'application Discord

1. [discord.com/developers/applications](https://discord.com/developers/applications) → **New Application**
2. Onglet **Bot** → **Reset Token** → copiez le jeton (`DISCORD_TOKEN`)
3. Onglet **OAuth2 → URL Generator** : cochez **bot**, puis les permissions
   **Manage Channels**, **Send Messages**, **Embed Links**
4. Ouvrez l'URL générée et invitez le bot sur votre serveur

⚠️ **Aucun « intent privilégié » n'est nécessaire.** Le bot n'écoute rien :
il ne lit ni les messages, ni la liste des membres. Si Discord vous demande
d'activer un intent, c'est que quelque chose d'autre le réclame.

### 2. Délivrer la clé du bot

Dans le panneau : **Supervision → la carte de l'espace → « Clé du bot Discord »**.

⚠️ **Ce n'est PAS la clé du serveur de jeu.** Celle du jeu *écrit* des
journaux ; celle-ci ne sait que les *lire*. Deux clés séparées, parce que
donner au bot le pouvoir d'écrire lui donnerait celui de fabriquer des
preuves — et parce que retirer l'une ne doit jamais couper l'autre.

### 3. Configurer et lancer

```bash
cd origin-logs/bot
cp .env.example .env
$EDITOR .env          # PANEL_URL, RELAY_KEY, DISCORD_TOKEN, DISCORD_GUILD_ID

node index.js --verifier   # contrôle la configuration
node index.js --salons     # crée les salons manquants, puis s'arrête
node index.js              # démarre
```

En service, derrière systemd :

```ini
[Unit]
Description=Origin Logs — bot Discord
After=network-online.target

[Service]
WorkingDirectory=/srv/origin-logs/bot
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5
User=origin

[Install]
WantedBy=multi-user.target
```

---

## Réglages qui comptent

| Clé | Effet |
|---|---|
| `CATEGORIES` | les rubriques suivies (vide = toutes) |
| `SEVERITIES` | les gravités suivies (vide = toutes) |
| `PING_ROLE_ID` + `PING_SEVERITIES` | qui est mentionné, et sur quoi |
| `MAX_PER_CHANNEL` | au-delà, le bot **résume** au lieu de détailler |
| `POLL_MS` | cadence du sondage (5 s par défaut) |
| `CREATE_CHANNELS` | `0` si vous créez les salons vous-même |

⚠️ **Mentionner sur tout revient à ne mentionner sur rien.** Par défaut,
seule la gravité `critique` déclenche une mention. Au bout de trois jours
de pings sur chaque connexion, plus personne ne regarde le salon.

⚠️ **Une rubrique bavarde noie un salon.** « Items au sol » ou « Écran du
joueur » produisent des centaines de lignes par soirée. Au-delà de
`MAX_PER_CHANNEL` d'un coup, le bot poste **un résumé** — le compte, les
plus graves, et rien d'autre. Le détail vit dans le panneau : le salon sert
à savoir qu'il s'est passé quelque chose, pas à mener l'enquête.

---

## Comment il tient

**Il sonde, il ne s'abonne pas.** Un flux temps réel se coupe sans
prévenir — un proxy qui recycle, un redémarrage, une coupure — et reprend
en ayant **perdu** ce qui est passé pendant l'interruption. Le bot demande
« ce qui est arrivé après l'évènement n° N » : s'il tombe, il reprend au
même N, et rien ne manque.

**Il retient où il en est** (`data/etat.json`). Sans cela, un redémarrage
rejouerait des mois de journaux dans Discord — le pire démarrage possible,
et la limite de débit atteinte en dix secondes.

⚠️ **Au tout premier lancement, il part du DERNIER évènement**, pas du
premier. L'historique reste dans le panneau, où il est consultable ; le
salon commence à l'instant où on branche le bot.

**Il avance son repère APRÈS avoir posté**, jamais avant : si Discord
refuse au milieu d'un lot, c'est exactement ce lot qu'on veut relire.

**Une limite de débit n'est pas une erreur, c'est le protocole.** Discord
répond avec le délai à attendre ; le bot attend et recommence. S'entêter
ferait basculer la limite au niveau du bot entier, et là plus rien ne part.

⚠️ **Aucune licence ne part dans Discord.** Un salon se lit à plus de monde
qu'on ne croit. Le relais remplace tout identifiant de joueur par un alias
stable — y compris **dans la charge utile des évènements**, où un
bannissement porte la licence de sa cible. Le contrôle est dans
`api/test/equipe.test.mjs` : il a trouvé cette fuite, elle était réelle.

---

## Quand ça ne marche pas

| Symptôme | Cause la plus fréquente |
|---|---|
| « Le panneau refuse le relais » | `RELAY_KEY` absente ou retirée, ou espace fermé |
| « Discord refuse le jeton » | jeton régénéré dans le portail développeur |
| « Serveur Discord introuvable » | bot pas invité, ou mauvais `DISCORD_GUILD_ID` |
| Aucun salon créé | permission **Manage Channels** manquante |
| Salons créés, rien dedans | rien ne s'est passé depuis le démarrage — c'est normal |
| Un salon reste muet | il a été supprimé ou rendu interdit : il sera recréé au prochain démarrage |

`VERBOSE=1` affiche chaque lot reporté et le repère courant.

---

## Contrôles

```bash
node test/bot.test.mjs
```

23 contrôles, contre une vraie API et un Discord de contrôle : création des
salons, absence de doublon au redémarrage, reprise sans perte, résumé d'une
rubrique bavarde, limite de débit respectée, salon interdit qui n'arrête pas
les autres, et l'absence de licence dans ce qui est posté.
