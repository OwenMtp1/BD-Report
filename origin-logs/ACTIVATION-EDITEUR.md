# Activation signée — le guide de l'éditeur

Ce document est **pour toi** (l'éditeur). Il explique comment garder la main
sur **le compte fondateur** et **la clé de chaque environnement** quand tu
confies un VPS à quelqu'un d'autre : rien ne se crée sans un **jeton signé par
toi**.

> **⚠️ La limite, en une phrase.** Le panneau tourne sur le VPS de l'opérateur,
> qui a les droits root. Ce verrou rend **ton autorisation obligatoire sur le
> chemin normal** — un opérateur coopératif ne peut pas créer de fondateur ni
> d'environnement sans toi. Il **ne protège pas** contre une modification
> délibérée du code par quelqu'un qui a root (il pourrait remplacer ta clé
> publique par la sienne). C'est la même limite que le reste de l'app.

## Le principe

- **Deux clés.** Une **privée** (reste chez toi, ne quitte jamais ta machine) et
  une **publique** (posée sur le VPS). La privée **signe**, la publique
  **vérifie**.
- **Sans clé publique sur le VPS, aucun verrou** : le panneau se comporte comme
  avant (utile pour tes propres tests). Le verrou s'active dès que la ligne
  `LICENCE_PUBKEY=…` est dans le `api/.env` du VPS.
- Tu émets deux sortes de jetons : un pour **le fondateur** (pseudo + mot de
  passe), un par **environnement** (nom + clé serveur). Chacun ne sert
  **qu'une fois**, et tu peux leur donner une **date d'expiration**.

## 1. Créer ta paire de clés (une seule fois)

Sur **ta** machine, dans `origin-logs/api` :

```bash
node licence.js keygen
```

- Écrit la clé **privée** dans `api/licence-privee.pem` — **garde ce fichier**,
  ne le commite jamais, ne le copie jamais sur un VPS (le `.gitignore` le
  protège déjà).
- Affiche la clé **publique** sous la forme `LICENCE_PUBKEY=…`.

## 2. Poser la clé publique sur le VPS

Avant de confier le VPS (ou au moment de l'installation), ajoute la ligne
affichée dans `api/.env` du VPS :

```
LICENCE_PUBKEY=MCowBQYDK2Vw...
```

Puis (re)démarre le service. À partir de là, le panneau est verrouillé.

> C'est **toi** qui poses cette ligne pendant que tu prépares le VPS. L'opérateur
> devrait la retirer volontairement pour contourner le verrou — geste délibéré
> et visible, pas un oubli.

## 3. Autoriser le compte fondateur

```bash
node licence.js fondateur "PseudoDuChef" "MotDePasseSolide" 30
```

- `30` (facultatif) = le jeton expire dans 30 jours. Omets-le pour un jeton
  sans expiration.
- Donne le jeton affiché à l'opérateur. Sur le VPS, il lance :
  ```bash
  node setup.js --activation "LE-JETON"
  ```
  Le compte est créé avec **le pseudo et le mot de passe que tu as choisis**.

## 4. Autoriser un environnement (à répéter pour chaque serveur)

```bash
node licence.js environnement "Los Santos RP"
```

- Affiche un **jeton d'activation** (à coller dans « Créer un environnement »
  du panneau) et, pour information, la **clé serveur** incluse dedans.
- L'opérateur colle le jeton dans le panneau → l'environnement est créé avec
  **exactement cette clé** et ce nom. Il met ensuite `url` + `clé` dans le
  `server.cfg` du serveur de jeu (cf. `BRANCHER-SUR-FIVEM.md`).
- Le même jeton **ne peut pas resservir** (refus « déjà utilisé »).

## Rappels

- **Un jeton = une création.** Réémets-en un pour chaque nouvel environnement.
- **Perte de la clé privée** = tu ne peux plus émettre de jetons (mais
  l'existant continue de tourner). `keygen` refuse d'écraser une clé existante ;
  pour repartir de zéro, supprime `licence-privee.pem` d'abord — **tous les
  jetons déjà émis deviennent alors invalides**.
- **Révocation.** Ce mode hors-ligne ne permet pas de couper à distance un
  environnement déjà activé : une fois signé, c'est signé. Si tu veux pouvoir
  révoquer, il faut le mode « serveur d'activation » (call-home), non installé
  ici.
