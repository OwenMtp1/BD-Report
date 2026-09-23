# Pousser les mises à jour vers un VPS

Ce dossier contient de quoi faire en sorte qu'un panneau installé chez
quelqu'un **aille chercher tout seul** les mises à jour dans un dépôt privé.

| Fichier | Rôle |
|---|---|
| `mise-a-jour.sh` | Le script : récupère, teste, redémarre, **revient en arrière si le panneau ne répond plus** |
| `maj.conf.exemple` | Les réglages, à copier dans `/etc/origin-logs-maj.conf` |
| `origin-logs-maj.service` | Ce que systemd exécute |
| `origin-logs-maj.timer` | Toutes les dix minutes, avec un décalage aléatoire |

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

### 2. Y pousser le produit, avec son historique

Depuis un clone de `BD-Report` :

```bash
git subtree split -P origin-logs -b origin-logs-seul
git push git@github.com:VOTRE-COMPTE/origin-logs.git origin-logs-seul:main
```

`git subtree split` reconstruit une histoire qui ne contient que les commits
touchant `origin-logs/`, avec le dossier remonté à la racine. Rien à nettoyer
ensuite, et le « pourquoi » de chaque changement suit.

### 3. Ensuite, à chaque fois

Rien de particulier : on développe dans `BD-Report` comme d'habitude, puis

```bash
git subtree split -P origin-logs -b origin-logs-seul
git push -f git@github.com:VOTRE-COMPTE/origin-logs.git origin-logs-seul:main
```

Le `-f` est normal : `subtree split` refabrique l'histoire à chaque fois, les
identifiants de commit changent. C'est sans danger — personne ne travaille
dans ce dépôt, il ne sert qu'à distribuer.

### Publier une VERSION plutôt qu'un commit

Dès qu'un vrai client écrit dans un de ces panneaux, réglez les VPS sur
`SUIVRE=etiquette` et publiez explicitement :

```bash
git tag v1.3 && git push git@github.com:VOTRE-COMPTE/origin-logs.git v1.3
```

Les machines ne bougent que là. Entre deux étiquettes, vous poussez autant de
code que vous voulez sans rien envoyer chez personne.

⚠️ Le script trie les étiquettes **par numéro de version, pas par date** :
`v1.10` passe après `v1.9`, et une correction publiée plus tard sur une
ancienne version ne fait pas reculer un serveur déjà passé à la suivante.

---

## Ce que la machine du client peut, et ne peut pas

- Elle **lit** le dépôt. La clé de déploiement est en lecture seule tant que
  *Allow write access* reste décoché à l'ajout.
- Elle ne peut rien y renvoyer, et ne voit aucun autre dépôt.
- Vous **révoquez** l'accès quand vous voulez, sans rien lui demander :
  *Settings → Deploy keys → Delete*. À la prochaine tentative, sa mise à jour
  échoue et son panneau continue de tourner sur la version qu'il a.
