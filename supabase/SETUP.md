# Brancher BD Report sur Supabase (synchro temps réel cross-device)

Tant que les clés ne sont pas renseignées, l'app fonctionne **exactement comme
avant** (stockage local par navigateur). Dès que tu colles l'URL + la clé anon,
toute l'app se synchronise en temps réel entre appareils, et le formulaire de
contact du site arrive réellement chez le support.

## 1. Créer le projet (≈ 5 min)
1. Va sur https://supabase.com → **Sign in** → **New project**.
2. Donne un nom (ex. `bd-report`), un mot de passe de base, une région proche.
3. Attends que le projet soit prêt (~2 min).

## 2. Créer les tables
1. Menu de gauche → **SQL Editor** → **New query**.
2. Copie-colle tout le contenu de `supabase/schema.sql` → **Run**.
   (Tu dois voir « Success. No rows returned ».)

## 3. Récupérer les clés
1. Menu de gauche → **Project Settings** (roue dentée) → **API**.
2. Copie :
   - **Project URL** (ex. `https://abcd1234.supabase.co`)
   - **anon public** key (longue chaîne `eyJ...`). C'est la clé **publique**,
     elle peut figurer dans le code client — ne partage **jamais** la clé
     `service_role`.

## 4. Renseigner les clés
Deux endroits (les mêmes valeurs) :
- **App** : `src/supabaseConfig.js` → remplir `SUPABASE_URL` et `SUPABASE_ANON_KEY`.
- **Site** : `site/index.html` → bloc `window.BDR_SUPABASE_URL` /
  `window.BDR_SUPABASE_ANON_KEY` (en haut du `<head>`).

> Ou bien colle-les moi dans le chat : je les commit et je déploie.

## 5. Déployer
Rebuild + redeploy (je m'en charge). Au prochain chargement, l'app pousse son
état courant dans Supabase puis se synchronise en continu.

## Comment ça marche
- `app_state` : 1 ligne JSONB contenant tout l'état de l'app, synchronisée en
  temps réel (dernier écrit gagnant, comme la synchro multi-onglets actuelle).
- `contact_requests` : le site y insère chaque message ; l'app les ingère dans
  « Nouvelles demandes » (temps réel) et crée demande/projet/fiche client.
- Repli : si Supabase est injoignable, l'app retombe sur le localStorage.

## Durcissement (plus tard, recommandé avant prod publique)
La config bêta autorise l'accès via la clé anon. Pour isoler les données par
client : activer **Supabase Auth** (email/mot de passe), une table
`accounts` liée à `auth.users`, et des policies RLS par `org_id`. Je peux le
faire dans un second temps une fois la bêta validée.
