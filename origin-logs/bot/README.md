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

## Un bot par espace, un seul processus

⚠️ **Chaque client branche SA propre application Discord**, depuis son
panneau : son nom, son avatar, son jeton, son interrupteur. Un jeton unique
partagé aurait voulu dire le même bot dans dix serveurs différents — et un
client qui le révoque les coupe tous.

Le **processus**, lui, les sert tous. Brancher un nouveau client ne demande
ni fichier, ni redémarrage, ni accès au serveur : il apparaît de lui-même
dans les deux minutes.

```
                    ┌─ #bannissement, #anticheat…  (serveur Discord du client A)
   panneau ──┬── bot A
             │
             └── bot B ─ #bannissement, #anticheat…  (serveur Discord du client B)
               un seul processus node
```

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

## Côté client — trois gestes, dans le panneau

Aucun fichier à toucher, aucun message au support.

### 1. Créer l'application Discord

1. [discord.com/developers/applications](https://discord.com/developers/applications) → **New Application**
2. Onglet **Bot** → **Reset Token** → copiez le jeton

⚠️ **Aucun « intent privilégié » n'est nécessaire.** Le bot n'écoute rien :
il ne lit ni les messages, ni la liste des membres. Si Discord vous demande
d'en activer un, c'est que quelque chose d'autre le réclame.

### 2. Le coller dans le panneau

**Liaison Discord → Bot Discord** : collez le jeton, vérifiez le serveur
(repris de la liaison existante — c'est le cas courant), **Enregistrer**.

⚠️ Le jeton ne redescend jamais à l'écran ensuite : on dit qu'il est en
place, on ne le réaffiche pas. Un écran d'administration se laisse ouvert.

### 3. Tester, puis inviter

**Tester la liaison** interroge Discord pour de vrai. S'il manque
l'invitation, le panneau affiche un **lien tout prêt**, avec exactement les
permissions nécessaires — voir et écrire dans les salons, publier des liens,
et gérer les salons pour créer ceux qui manquent.

⚠️ « Enregistré » ne veut pas dire « ça marche » : un jeton régénéré, un bot
jamais invité et un mauvais identifiant de serveur se ressemblent et ne se
corrigent pas pareil. C'est ce que le test départage.

---

## Côté éditeur — le processus

```bash
cd origin-logs/bot
cp .env.example .env
$EDITOR .env               # PANEL_URL + BOT_KEY (la même que dans api/.env)

node index.js --verifier   # la configuration est-elle complète ?
node index.js              # démarre — il sert tous les clients branchés
```

`setup.js` génère `BOT_KEY` dans `api/.env` : recopiez-la ici.

⚠️ **Cette clé n'est PAS un jeton Discord.** Elle ne fait qu'une chose :
permettre au processus de demander au panneau *« quels espaces dois-je
servir ? »*. C'est la seule route du produit qui rende des jetons Discord,
et elle n'existe pas tant que `BOT_KEY` est vide.

**Un serveur qui héberge son propre panneau** n'a pas besoin de cette clé :
il pose `RELAY_KEY` à la place et ne sert que son espace. La clé de relais
se délivre toute seule quand on branche un bot dans le panneau.

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

⚠️ **Ils vivent dans le panneau, pas ici** — chaque client règle les siens,
et le bot les prend au tour suivant. Un client qui veut couper une rubrique
trop bavarde n'écrit à personne.

| Réglage (panneau) | Effet |
|---|---|
| Rôle mentionné + gravité | qui est mentionné, et sur quoi |
| Préfixe des salons | `logs-` → `#logs-anticheat` |
| Résumer au-delà de | au-delà, le bot **résume** au lieu de détailler |

Ce qui reste dans `bot/.env`, côté éditeur : `PANEL_URL`, `BOT_KEY`,
`POLL_MS` (cadence, 5 s), `INVENTORY_MS` (à quelle fréquence on redemande
la liste des espaces, 2 min) et `VERBOSE`.

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

**Il retient où il en est** (`data/etat.json`), **un repère par espace**.
Un repère commun ferait sauter à l'un ce que l'autre a déjà lu. Sans état du
tout, un redémarrage rejouerait des mois de journaux dans Discord — le pire
démarrage possible, et la limite de débit atteinte en dix secondes.

**Une panne chez un client n'emporte pas les autres.** Dix clients servis par
un processus, c'est dix pannes possibles, et aucune qui ait le droit
d'arrêter les neuf autres.

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
| « Le panneau refuse » | `BOT_KEY` différente de celle d'`api/.env`, ou `RELAY_KEY` retirée |
| « Discord refuse ce jeton » | jeton régénéré dans le portail développeur |
| « Le bot n'est pas encore sur ce serveur » | invitez-le avec le lien que le panneau affiche |
| Un client n'est pas servi | il lui manque une pièce : le démarrage la NOMME |
| Aucun salon créé | permission **Manage Channels** manquante |
| Salons créés, rien dedans | rien ne s'est passé depuis le démarrage — c'est normal |
| Un salon reste muet | il a été supprimé ou rendu interdit : il sera recréé au prochain démarrage |

`VERBOSE=1` affiche chaque lot reporté et le repère courant.

---

## Contrôles

```bash
node test/bot.test.mjs
```

35 contrôles, contre une vraie API et un Discord de contrôle : **deux
clients avec deux serveurs Discord et aucun mélange**, un **troisième
branché en cours de route sans redémarrage**, création des salons, absence
de doublon, reprise sans perte, résumé d'une rubrique bavarde, limite de
débit respectée, salon interdit qui n'arrête pas les autres, et l'absence de
licence dans ce qui est posté.
