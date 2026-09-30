# Mettre Origin Logs sur ton dépôt GitHub

Ce dossier contient **tout le projet**. Objectif : le poser sur **ton** dépôt
GitHub, donner un accès à l'éditeur pour qu'il puisse t'envoyer les mises à
jour, puis l'installer sur ton VPS.

Trois étapes. Compte dix minutes.

---

## 1. Créer le dépôt et y pousser le projet

Décompresse l'archive quelque part, puis, **dans le dossier obtenu** (celui qui
contient `api/`, `index.html`, `maj/`…) :

```bash
git init
git add .
git commit -m "Origin Logs — version initiale"
git branch -M main
```

Crée un dépôt **vide et PRIVÉ** sur ton GitHub (sans README, sans .gitignore —
le projet en a déjà un), puis relie-le et pousse :

```bash
git remote add origin git@github.com:TON-COMPTE/TON-DEPOT.git
git push -u origin main
```

> Remplace `TON-COMPTE/TON-DEPOT` par le nom réel. Si tu n'as pas de clé SSH
> GitHub, utilise l'URL `https://github.com/TON-COMPTE/TON-DEPOT.git` pour ce
> premier envoi.

**Garde-le PRIVÉ** : le code n'a pas vocation à être public.

---

## 2. Donner l'accès à l'éditeur (pour les mises à jour)

Pour que l'éditeur puisse pousser les correctifs et nouveautés directement sur
ton dépôt :

> `github.com/TON-COMPTE/TON-DEPOT` -> **Settings** -> **Collaborators** ->
> **Add people** -> son identifiant GitHub -> rôle **Write**

Il recevra une invitation à accepter. À partir de là, il pousse les mises à
jour ; ton VPS les récupère tout seul (étape 3).

Rien d'autre ne lui est ouvert : **seul ce dépôt**, en écriture. Il n'a aucun
accès à ton VPS, à ton serveur de jeu, ni au reste de ton GitHub.

---

## 3. Installer sur le VPS

Ouvre **`INSTALLER-SUR-VPS.md`** (dans ce même dossier) et suis-le — ou
colle-le entier à un assistant qui a un accès terminal à ton VPS. Il cloné
**ton** dépôt, et le panneau se met ensuite à jour tout seul à chaque fois que
l'éditeur y pousse quelque chose.

---

## Ce qu'il y a dans ce dossier

- `api/` — le serveur (Node, zéro dépendance).
- `resource/` — la ressource FiveM à copier sur le serveur de jeu.
- `index.html` / `panel.html` — le panneau web (index.html est le fichier servi).
- `maj/` — les mises à jour automatiques (systemd).
- `bot/` — le bot Discord optionnel.
- `INSTALLER-SUR-VPS.md` — l'installation pas à pas.
- `BRANCHER-SUR-FIVEM.md`, `COMMENT-CA-MARCHE.md`, `DEPLOIEMENT.md` — pour aller
  plus loin.

Aucune clé, aucun secret, aucune donnée n'est dans l'archive : tout ça se
génère sur ton VPS à l'installation.
