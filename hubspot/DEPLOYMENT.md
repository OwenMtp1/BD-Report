# 🚀 Déployer le connecteur HubSpot — Guide complet

Ce guide vous explique **exactement quoi faire** pour déployer le Worker Cloudflare et connecter BD Report à votre HubSpot.

---

## ✅ Préalables (vérifiés)

- ✅ Compte Cloudflare créé
- ✅ Compte HubSpot développeur créé
- ✅ App HubSpot créée (avec Client ID + Client Secret notés)
- ✅ Node.js + npm installés

---

## 📋 Les 3 phases

| Phase | Ce qu'on fait | Durée |
|---|---|---|
| **1. Préparer** | Générer les secrets cryptographiquement forts | 2 min |
| **2. Déployer** | Exécuter les commandes `wrangler` | 5 min |
| **3. Activer** | Coller l'URL du Worker dans BD Report | 1 min |

---

## PHASE 1️⃣ : Générer les secrets

Vous devez créer deux valeurs aléatoires sécurisées :

### `STATE_SECRET` (chaîne aléatoire 64 caractères)

**Sous Windows (PowerShell)** :
```powershell
-join ((1..64) | ForEach-Object { [char][int]::Parse((Get-Random -Minimum 48 -Maximum 122)) }) | Where-Object { $_ -match '[0-9a-f]' } | Select-Object -First 64
```

**Sous Mac/Linux** :
```bash
openssl rand -hex 32
```

Cela vous donne une chaîne comme : `a3f2b8c1d9e4f7a2b5c8d1e4f7a2b5c8d1e4f7a2b5c8d1e4f7a2b5c8d1e4f`

→ **Copiez cette valeur et gardez-la de côté.**

---

## PHASE 2️⃣ : Déployer le Worker

### Étape 1 : Ouvrez un terminal

**Windows** :
1. Appuyez sur `Win + R`
2. Tapez `cmd` et appuyez sur Entrée

**Mac** :
1. Appuyez sur `Cmd + Espace`
2. Tapez `Terminal` et appuyez sur Entrée

**Linux** :
1. Ouvrez le Terminal depuis le menu d'applications

### Étape 2 : Allez dans le dossier du projet

Copiez-collez cette commande et appuyez sur Entrée :

```bash
cd ~/Claude/hubspot
```

Vous devriez voir `hubspot` dans le chemin du terminal.

---

### Étape 3 : Connectez-vous à Cloudflare

Copiez-collez ceci et appuyez sur Entrée :

```bash
npx wrangler login
```

→ Votre navigateur s'ouvre automatiquement
→ Cliquez sur **« Autoriser »** pour donner à Cloudflare l'accès
→ Revenez au terminal (il dit « Success! »)

---

### Étape 4 : Créez l'espace de stockage KV

Copiez-collez ceci et appuyez sur Entrée :

```bash
npx wrangler kv namespace create TENANTS
```

→ Vous recevez un résultat comme :
```
{
  "id": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
}
```

**→ Copiez ce `id` (la longue chaîne alphanumérique)**

---

### Étape 5 : Mettez à jour `wrangler.toml`

1. Ouvrez le fichier `wrangler.toml` avec un éditeur de texte (Notepad, VS Code, etc.)
2. Trouvez cette ligne :
   ```toml
   id = "REMPLACEZ_PAR_L_ID_RENVOYE_PAR_WRANGLER"
   ```
3. Remplacez-la par :
   ```toml
   id = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
   ```
   (collez le vrai id que vous avez reçu)

4. Sauvegardez le fichier

---

### Étape 6 : Ajoutez vos secrets Cloudflare

Revenez au terminal et exécutez ces trois commandes **une par une** :

#### Commande 1️⃣ : Client ID HubSpot
```bash
npx wrangler secret put HUBSPOT_CLIENT_ID
```

→ Le terminal vous demande la valeur
→ Copiez-collez votre **Client ID** (de l'app HubSpot)
→ Appuyez sur Entrée
→ Attendez le message de succès

#### Commande 2️⃣ : Client Secret HubSpot
```bash
npx wrangler secret put HUBSPOT_CLIENT_SECRET
```

→ Le terminal vous demande la valeur
→ Copiez-collez votre **Client Secret** (de l'app HubSpot)
→ Appuyez sur Entrée
→ Attendez le message de succès

#### Commande 3️⃣ : State Secret
```bash
npx wrangler secret put STATE_SECRET
```

→ Le terminal vous demande la valeur
→ Copiez-collez votre **STATE_SECRET** (générée plus haut)
→ Appuyez sur Entrée
→ Attendez le message de succès

---

### Étape 7 : Déployez le Worker

Copiez-collez ceci et appuyez sur Entrée :

```bash
npx wrangler deploy
```

→ Wrangler build et déploie le Worker
→ À la fin, vous voyez une URL comme :
```
Deployment complete! Your worker is published to:
https://bdr-hubspot-connector.votre-compte.workers.dev
```

**→ Copiez cette URL entière**

---

### Étape 8 : Mettez à jour HubSpot

Retournez sur https://developers.hubspot.com/, dans votre app :

1. Onglet **« Auth »**
2. Trouvez **« Redirect URLs »**
3. Remplacez l'URL provisoire par votre vraie URL du Worker :
   ```
   https://bdr-hubspot-connector.votre-compte.workers.dev/oauth/callback
   ```
4. Cliquez **« Save »**

---

## PHASE 3️⃣ : Activer dans BD Report

### Dernière étape : Publier l'URL du connecteur

1. **Connectez-vous à BD Report** avec un compte fondateur
2. Allez à **Administration → Intégration HubSpot → Afficher les réglages avancés**
3. Collez l'URL du Worker dans le champ **« URL du connecteur »** :
   ```
   https://bdr-hubspot-connector.votre-compte.workers.dev
   ```
4. Cliquez **« Enregistrer »**

---

## ✅ C'est fini !

Chaque client peut maintenant cliquer sur **« Connecter mon HubSpot »** dans la console et relier son portail en 2 minutes.

---

## 🆘 Besoin d'aide ?

Si une commande échoue, dites-moi :
- Quelle étape ?
- Le message d'erreur exact (copiez-collez)

Je suis là pour aider.
