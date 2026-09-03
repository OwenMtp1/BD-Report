# Migration multi-tenant (isolation par société cliente)

Objectif : passer d'**un seul blob partagé** (`app_state.main`, lisible/écrivable par
n'importe qui via la clé anon) à une **isolation stricte par organisation** :
chaque société cliente n'accède qu'à ses propres données, authentifiée via Supabase Auth,
garanti côté serveur par la RLS (`org_state` membre-only).

> ⚠️ La branche de travail est **auto-déployée en prod**. La bascule se fait donc en
> étapes : on construit le nouveau chemin **désactivé par défaut** (drapeau `multiTenant`
> OFF), on prépare et vérifie la base, **on sauvegarde**, puis on bascule volontairement.

## Modèle de données

| Aujourd'hui (blob `main`)            | Cible (multi-tenant)                         |
|--------------------------------------|----------------------------------------------|
| `db.accounts[]` (login interne)      | `auth.users` + `public.profiles`             |
| `db.environments[]` (société)        | `public.orgs`                                 |
| membres d'un environnement           | `public.org_members` (+ rôle)                |
| `db.subenvs[]` + `db.data[subId]`    | `public.org_state.data` (JSONB **par org**)  |
| support BD Report (tickets, demandes)| org « plateforme » dédiée (ou flag admin)    |

Fichier de schéma cible : **`supabase/schema_multitenant.sql`**.

## Étapes (réversibles)

### 0. SAUVEGARDE (obligatoire avant tout)
Dans Supabase → SQL Editor :
```sql
-- Copie l'intégralité de l'état actuel dans une table d'archive horodatée.
create table if not exists public.app_state_backup as
  select id, data, updated_at, now() as backed_up_at from public.app_state where id = 'main';
-- Vérifie : doit renvoyer 1 ligne.
select id, jsonb_typeof(data) , backed_up_at from public.app_state_backup;
```
Exporte aussi le JSON en local (bouton « Download » sur le résultat de
`select data from app_state where id='main'`). **Ne supprime rien tant que la bascule
n'est pas validée.**

### 1. Schéma cible (additif, sans toucher à l'existant)
Exécuter `supabase/schema_multitenant.sql`. Crée `profiles / orgs / org_members /
org_state` + RLS + trigger d'auto-profil. L'ancienne table `app_state` reste intacte et
l'app continue de tourner dessus (drapeau OFF).

### 2. Activer Supabase Auth
Supabase → Authentication → Providers → **Email** activé. (Option : désactiver les
inscriptions publiques ; on créera les comptes nous-mêmes à l'étape 3.)

### 3. Migrer les comptes & découper le blob (script one-shot ✅ livré)
Le script **`supabase/migrate_blob_to_orgs.mjs`** est fourni. À partir du blob sauvegardé,
il :
1. crée un `auth.users` + `profiles` pour chaque `account` (mot de passe : il déclenche un
   **e-mail de réinitialisation**, puisqu'on ne stocke plus aucun mot de passe en clair) ;
2. crée une `org` par `environment`, remplit `org_members` selon `members[]` + rôles ;
3. écrit, pour chaque org, son `org_state.data` = uniquement ses `subenvs` + `data[subId]`
   (chiffré au repos, même découpage que le sync runtime — `splitDb`) ;
4. place les comptes de l'équipe BD Report en `is_platform_admin = true` + crée une org
   « plateforme » pour le support et les données non rattachées.

Il tourne **hors prod** (lecture d'un export local du backup), est ré-exécutable (idempotent,
recherche par email / `meta.appEnvId`) et **n'altère jamais `app_state`**. Il est en **DRY-RUN
par défaut** — il n'écrit rien tant que `--commit` n'est pas passé :
```bash
# 1) exporter le blob depuis Supabase (select data from app_state where id='main') → backup.json
# 2) prévisualiser (aucune écriture) :
node supabase/migrate_blob_to_orgs.mjs --blob=./backup.json
# 3) appliquer (nécessite la clé service_role, jamais commitée) :
export SUPABASE_URL="https://xxxx.supabase.co"
export SUPABASE_SERVICE_ROLE="eyJ...service_role..."
node supabase/migrate_blob_to_orgs.mjs --blob=./backup.json --commit
```

### 4. Adapter l'app (derrière le drapeau `multiTenant`, OFF par défaut)
Côté code (livré par étapes, sans rien activer en prod) :
- `src/supabaseConfig.js` : `export const FEATURES = { multiTenant: false }`.
- Nouveau `src/supabaseAuth.js` : login/logout via `supabase.auth`, session courante.
- Nouveau `src/multiTenantSync.js` : charge `profiles` + `orgs` du user + `org_state` de
  chaque org ; push debouncé **par org** ; realtime filtré `org_id=in(...)`.
- `src/store.jsx` : si `FEATURES.multiTenant`, assemble `db` à partir des org_state chargés
  et route les écritures vers la bonne org ; sinon, comportement actuel inchangé.
- Login : écran Supabase Auth (e-mail + mot de passe) quand le drapeau est ON.

### 5. Recette sur projet de test
Cloner les données dans un **projet Supabase de test**, activer le drapeau, vérifier :
- un user d'org A ne voit jamais les données d'org B (test via l'API REST avec sa session) ;
- realtime OK ; admin plateforme voit tout ; résiliation/lecture seule OK.

### 6. Bascule prod (fenêtre courte, annoncée)
1. Re-sauvegarde fraîche (étape 0).
2. Re-run du script de migration (idempotent) pour rattraper les écritures récentes.
3. Déployer avec `FEATURES.multiTenant = true`.
4. Verrouiller l'ancienne table :
   ```sql
   drop policy if exists "app_state_read"   on public.app_state;
   drop policy if exists "app_state_insert" on public.app_state;
   drop policy if exists "app_state_update" on public.app_state;
   -- plus aucune policy ⇒ anon n'a plus aucun accès à app_state.
   ```
5. **Régénérer la clé anon** (Supabase → API) et la mettre à jour dans `supabaseConfig.js`
   + `site/index.html`. L'ancienne clé exposée devient inutile.

### Rollback
Tant que `app_state.main` existe et que sa RLS n'est pas retirée, il suffit de
redéployer avec `FEATURES.multiTenant = false` pour revenir à l'état actuel. Le backup
`app_state_backup` permet de restaurer le blob si besoin :
```sql
update public.app_state s set data = b.data
  from public.app_state_backup b where s.id = 'main' and b.id = 'main';
```

## Limites assumées
- Tant que l'app reste 100 % front, **toute clé envoyée au navigateur est publique** :
  la sécurité repose entièrement sur la RLS (côté serveur), pas sur le secret de la clé.
- L'isolation devient réelle **à partir de l'étape 6** (verrouillage de `app_state` +
  bascule). Avant, on prépare sans rien exposer de plus.
