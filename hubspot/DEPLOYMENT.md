# 🚀 Déployer le connecteur HubSpot — sans terminal

Ce guide se fait **entièrement dans le navigateur**, en cliquant. Aucune commande à taper.
Comptez ~15 minutes.

> Vous préférez le terminal ? La méthode `wrangler` est en annexe, tout en bas.

---

## Ce qu'on va faire

| Étape | Où | Durée |
|---|---|---|
| 1. Créer le connecteur | Cloudflare | 3 min |
| 2. Coller le code | Cloudflare | 2 min |
| 3. Créer le coffre à jetons | Cloudflare | 2 min |
| 4. Brancher le coffre | Cloudflare | 1 min |
| 5. Renseigner les clés | Cloudflare | 4 min |
| 6. Finir côté HubSpot | HubSpot | 1 min |
| 7. Activer dans BD Report | BD Report | 1 min |

Gardez sous la main votre **Client ID** et votre **Client Secret** HubSpot.

---

## 1️⃣ Créer le connecteur

1. Allez sur **<https://dash.cloudflare.com>** et connectez-vous.
2. Dans le menu de gauche : **Compute (Workers)** → **Workers & Pages**.
3. Bouton **« Create »** (ou « Créer »).
4. Choisissez **« Start with Hello World! »** → **« Get started »**.
5. Dans **« Name »**, effacez le nom proposé et tapez exactement :

   ```
   bdr-hubspot-connector
   ```

6. Cliquez **« Deploy »** (ou « Déployer »).

Cloudflare affiche alors l'adresse de votre connecteur, du style :

```
https://bdr-hubspot-connector.quelquechose.workers.dev
```

📌 **Copiez cette adresse dans un bloc-notes.** On s'en servira aux étapes 6 et 7.

---

## 2️⃣ Coller le code du connecteur

1. Ouvrez ce lien dans un **nouvel onglet** :

   <https://raw.githubusercontent.com/OwenMtp1/BD-Report/claude/adoring-tesla-t0fwpc/hubspot/proxy-worker.js>

2. Cliquez dans la page, puis **Ctrl + A** (tout sélectionner) et **Ctrl + C** (copier).
   *(Sur Mac : Cmd + A puis Cmd + C.)*

3. Revenez sur Cloudflare, sur votre worker `bdr-hubspot-connector`.
4. Cliquez **« Edit code »** (ou l'icône `< >` / « Modifier le code »).
5. Dans l'éditeur, cliquez dans le code existant, faites **Ctrl + A** puis **Ctrl + V**
   pour tout remplacer par le code copié.
6. Cliquez **« Deploy »** en haut à droite.

> ⚠️ Un message d'erreur rouge peut apparaître pour l'instant : c'est normal,
> il manque encore les clés. On les ajoute juste après.

---

## 3️⃣ Créer le coffre à jetons (KV)

C'est l'espace où le connecteur rangera, **séparément pour chaque client**, l'autorisation
d'accès à son HubSpot.

1. Menu de gauche : **Storage & Databases** → **KV**.
2. Bouton **« Create a namespace »** (ou « Créer »).
3. Nom exact :

   ```
   TENANTS
   ```

4. Cliquez **« Add »** / **« Create »**.

---

## 4️⃣ Brancher le coffre sur le connecteur

1. Retournez sur **Workers & Pages** → cliquez sur `bdr-hubspot-connector`.
2. Onglet **« Settings »** (Paramètres) → section **« Bindings »** (Liaisons).
3. Bouton **« Add »** → choisissez **« KV namespace »**.
4. Remplissez :
   - **Variable name** : `TENANTS`  *(en majuscules, exactement)*
   - **KV namespace** : sélectionnez `TENANTS` dans la liste déroulante
5. Cliquez **« Deploy »** / **« Save »**.

---

## 5️⃣ Renseigner les clés

Toujours dans **Settings**, section **« Variables and Secrets »**.

Vous allez ajouter **4 entrées**. Pour chacune : bouton **« Add »**, puis remplir, puis
**« Deploy »** / **« Save »**.

### Entrée 1 — Client ID

| Champ | Valeur |
|---|---|
| Type | **Secret** |
| Name | `HUBSPOT_CLIENT_ID` |
| Value | votre Client ID HubSpot |

### Entrée 2 — Client Secret

| Champ | Valeur |
|---|---|
| Type | **Secret** |
| Name | `HUBSPOT_CLIENT_SECRET` |
| Value | votre Client Secret HubSpot |

### Entrée 3 — Clé de signature

Cette clé sert au connecteur à signer ses échanges. Elle n'existe nulle part ailleurs :
**inventez-la**.

👉 Ouvrez un bloc-notes et **tapez au hasard sur votre clavier**, environ 60 caractères,
en mélangeant lettres et chiffres. Par exemple en martelant : `k3j9xm2qp7...`
Ne cherchez pas à retenir cette valeur, vous n'en aurez plus jamais besoin.

| Champ | Valeur |
|---|---|
| Type | **Secret** |
| Name | `STATE_SECRET` |
| Value | vos ~60 caractères au hasard |

### Entrée 4 — Adresses autorisées

Celle-ci n'est pas secrète : elle dit au connecteur depuis quels sites l'app a le droit
de l'appeler.

| Champ | Valeur |
|---|---|
| Type | **Text** (texte, pas secret) |
| Name | `ALLOWED_ORIGINS` |
| Value | `https://bdreport.js.org,https://owenmtp1.github.io,http://localhost:5173` |

> Copiez la valeur telle quelle, virgules comprises, **sans espaces**.

---

## 6️⃣ Finir côté HubSpot

1. Retournez sur **<https://developers.hubspot.com>** → votre app.
2. Onglet **« Auth »** → champ **« Redirect URLs »**.
3. Effacez l'adresse provisoire et collez votre vraie adresse de connecteur,
   **suivie de `/oauth/callback`** :

   ```
   https://bdr-hubspot-connector.quelquechose.workers.dev/oauth/callback
   ```

   *(remplacez `quelquechose` par ce que Cloudflare vous a donné à l'étape 1)*

4. Cliquez **« Save »**.

---

## 7️⃣ Activer dans BD Report

1. Connectez-vous à BD Report avec votre compte **Fondateur**.
2. **Administration** → **Intégration HubSpot**.
3. Cliquez **« Afficher les réglages avancés »**.
4. Dans **« URL du connecteur »**, collez l'adresse **sans** `/oauth/callback` :

   ```
   https://bdr-hubspot-connector.quelquechose.workers.dev
   ```

5. Enregistrez.

---

## ✅ Vérifier que ça marche

Toujours dans **Administration → Intégration HubSpot** :

1. Cliquez **« Connecter mon HubSpot »**.
2. Une fenêtre HubSpot s'ouvre et vous demande d'autoriser BD Report.
3. Acceptez → la fenêtre se ferme et le portail relié s'affiche dans la console.

Si c'est le cas, c'est terminé : **chacun de vos clients verra ce même bouton** et pourra
relier son propre HubSpot en deux clics, sans jamais manipuler de clé.

---

## ⚠️ Les pièges (vécus)

### App **publique** ≠ app **privée**

C'est la confusion n°1, et elle coûte cher.

| | App **publique** (OAuth) | App **privée** |
|---|---|---|
| Où on la crée | `developers.hubspot.com` (compte développeur) | `app.hubspot.com/private-apps` (votre CRM) |
| Ce qu'elle donne | **Client ID** + **Client Secret** (format `xxxxxxxx-xxxx-…`) | un **jeton** `pat-eu1-…` |
| À quoi ça sert | **chaque client relie SON portail** ← l'objectif | **votre portail à vous** uniquement |
| Où ça se met | secrets Cloudflare (étape 5) | champ « Jeton d'application privée » dans BD Report |

Un jeton `pat-…` collé dans `HUBSPOT_CLIENT_ID` produit une page HubSpot
**« Unable to load app information »** : HubSpot ne reconnaît pas ce jeton comme un
`client_id`. Si vous voyez ce message, vérifiez d'abord ce point.

### Les variables Cloudflare restent en brouillon

Ajouter une variable ne suffit pas : elle n'entre en vigueur qu'après un clic sur
**« Deploy »**. Symptôme : *« Connecteur incomplet : HUBSPOT_CLIENT_ID / … manquants »*
alors que les 4 lignes sont bien affichées.

Si « Deploy » est grisé dans l'éditeur de code, ajoutez une ligne vide à la fin du
fichier pour le réactiver.

### Espaces parasites au copier-coller

Un espace avant ou après une clé la rend invalide, sans message clair. Recopiez sans
déborder sur les caractères voisins.

### Deux champs « Jeton d'application privée »

Dans les réglages avancés de BD Report, l'intitulé apparaît deux fois :

- celui avec un bouton **« Enregistrer »** → le jeton part au **connecteur** ✅
- celui avec une icône **œil 👁️** → mode « API directe », le navigateur bloquera (CORS) ❌

Repère : **le bon champ a un bouton « Enregistrer » à côté.**

### Les champs ne s'enregistrent qu'en les quittant

Après avoir collé une valeur, **cliquez à côté du champ** (ou `Tab`). Sinon rien n'est
retenu — et le bouton « Connecter mon HubSpot » reste grisé, sans message d'erreur.

---

## 🆘 Table de dépannage

| Message | Cause | Correctif |
|---|---|---|
| « Unable to load app information » | un jeton `pat-…` est dans `HUBSPOT_CLIENT_ID` | mettez-y le Client ID d'une app **publique** |
| « Connecteur incomplet : … manquants » | variables non déployées | rouvrez le worker et cliquez **Deploy** |
| « Espace KV TENANTS non lié » | étape 4 manquée ou mal nommée | le **Variable name** doit être `TENANTS`, en majuscules |
| « Appel bloqué par le navigateur (CORS) » | mode « API directe » sélectionné | repassez sur « Connexion HubSpot du client » |
| « Clé d'entreprise invalide » | l'app et le coffre ne sont plus synchronisés | supprimez l'entrée `tenant:…` dans le KV, puis reconnectez |
| « redirect_uri mismatch » | l'adresse de l'étape 6 diffère | recopiez-la avec `/oauth/callback`, sans `/` en trop |
| Bouton « Connecter » grisé, aucun message | URL du connecteur non enregistrée | recollez-la et **cliquez à côté du champ** |

---

## Voie de repli : marcher tout de suite avec un jeton privé

Pour valider la chaîne sur **votre propre portail** sans attendre l'app publique :

1. **<https://app.hubspot.com/private-apps>** → créez une app privée (ou ouvrez la vôtre)
2. Onglet **Portées** : cochez les 14 autorisations requises (liste dans `SETUP.md`)
3. Onglet **Jeton d'accès** → **« Faire pivoter le jeton »** → copiez-le
4. BD Report → réglages avancés → laissez le mode sur **« Connexion HubSpot du client »**
   → collez le jeton dans le champ **muni du bouton « Enregistrer »** → Enregistrer
5. **« Tester la connexion »**

Le jeton part au connecteur, qui le garde côté serveur : il ne reste jamais dans l'app.
Ce mode ne dessert que votre portail — vos clients ont toujours besoin de l'app publique.

---

## Annexe — la même chose en ligne de commande

Pour référence, si vous préférez le terminal :

```bash
cd hubspot
npx wrangler login
npx wrangler kv namespace create TENANTS   # recopiez l'id dans wrangler.toml
npx wrangler secret put HUBSPOT_CLIENT_ID
npx wrangler secret put HUBSPOT_CLIENT_SECRET
npx wrangler secret put STATE_SECRET
npx wrangler deploy
```

Détails et options avancées : **`hubspot/SETUP.md`**.
