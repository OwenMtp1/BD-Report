# Pousser les mises à jour vers un VPS

Ce dossier contient de quoi faire en sorte qu'un panneau installé chez
quelqu'un **aille chercher tout seul** les mises à jour dans un dépôt privé.

| Fichier | Rôle |
|---|---|
| `mise-a-jour.sh` | Le script : récupère, teste, redémarre, **revient en arrière si le panneau ne répond plus** |
| `maj.conf.exemple` | Les réglages, à copier dans `/etc/origin-logs-maj.conf` |
| `origin-logs-maj.service` | Ce que systemd exécute |
| `origin-logs-maj.timer` | Toutes les dix minutes, avec un décalage aléatoire |
| `publier.sh` | **Côté éditeur** : extrait ce dossier et le pousse vers le dépôt de distribution |

La mise en place **côté VPS** est décrite pas à pas dans
`../INSTALLER-SUR-VPS.md`, étape 11 — c'est ce fichier qu'on envoie à la
personne qui installe.

---

## Ce qu'il y a à faire de votre côté, une seule fois

### 1. Un dépôt privé qui ne contient QUE ce produit

⚠️ **Pas le dépôt `BD-Report`.** Il porte aussi le SaaS BD Report : son code,
son schéma Supabase, son connecteur HubSpot. Une clé de déploiement posée
dessus donnerait accès à tout cela à la machine d'un tiers.

Sur GitHub : **New repository** → nom `origin-logs` → **Private** → ne cochez
rien d'autre (ni README, ni .gitignore : le contenu arrive juste après).

Dépôt en service : **`OwenMtp1/origin-logs`** (privé).

### 2. Publier — une commande

On développe dans `BD-Report` comme d'habitude, on commite, puis :

```bash
bash origin-logs/maj/publier.sh
```

Le script extrait l'histoire de `origin-logs/` (dossier remonté à la racine,
le « pourquoi » de chaque changement suit), la pousse, et s'arrête si quelque
chose n'est pas commité — le dépôt de distribution doit refléter un état
qu'on peut retrouver chez soi.

### 3. Publier une VERSION

⚠️ **Ce dépôt EST le canal de versions.** L'atelier, c'est l'autre dépôt (privé,
celui où l'on développe au jour le jour). On ne pousse ICI que ce qui est bon
pour les joueurs — donc **publier, c'est mettre en ligne**. Rien ne transite ici
« pour voir » : l'aperçu se fait ailleurs (l'artefact de démonstration).

```bash
bash origin-logs/maj/publier.sh          # publie l'état validé -> les VPS l'ont dans 10 min
bash origin-logs/maj/publier.sh v1.3     # …avec un numéro de version en label
```

Les VPS suivent la branche de ce dépôt : puisqu'elle ne reçoit que des versions
validées, ils ne prennent que des versions validées. Dans les dix minutes qui
suivent un `publier.sh` : tests, redémarrage, retour arrière automatique si le
panneau ne répond plus.

⚠️ **Le numéro de version est un LABEL, pas ce que suit la machine.** Le VPS
regarde le commit de branche, pas le tag. Le tag ne sert qu'à retrouver « la
v1.3 » d'un coup d'œil, et son envoi est best-effort : s'il ne passe pas (des
relais git coupent les pushs de tag), **la version est livrée quand même**.

⚠️ **Ne rien pousser d'inachevé ici.** Comme ce dépôt est le canal de versions,
un `publier.sh` lancé sur du code non validé partirait chez les joueurs. Le
travail en cours reste dans l'atelier (l'autre dépôt) jusqu'à ce qu'il soit bon.

⚠️ Le script de mise à jour trie les étiquettes **par numéro de version, pas
par date** : `v1.10` passe après `v1.9`, et une correction publiée plus tard
sur une ancienne version ne fait pas reculer un serveur déjà passé à la
suivante.

---

## Ce que la machine du client peut, et ne peut pas

- Elle **lit** le dépôt. La clé de déploiement est en lecture seule tant que
  *Allow write access* reste décoché à l'ajout.
- Elle ne peut rien y renvoyer, et ne voit aucun autre dépôt.
- Vous **révoquez** l'accès quand vous voulez, sans rien lui demander :
  *Settings → Deploy keys → Delete*. À la prochaine tentative, sa mise à jour
  échoue et son panneau continue de tourner sur la version qu'il a.
