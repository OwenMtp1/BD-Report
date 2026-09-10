# Runbook — fermer le trou de sécurité de `app_state`

> **Ce document décrit les seules étapes qui restent, et elles vous appartiennent** : elles
> demandent l'accès au tableau de bord Supabase, la clé `service_role` (un secret qui ne doit
> jamais transiter ailleurs) et la rotation de la clé anon. Le code, lui, est prêt et vérifié.

## Où en est-on exactement

| Élément | État |
|---|---|
| Schéma cible (`orgs`, `org_members`, `org_state`, RLS) | ✅ écrit — `schema_multitenant.sql` |
| Script de migration du blob vers les orgs | ✅ écrit, idempotent, DRY-RUN par défaut — `migrate_blob_to_orgs.mjs` |
| Authentification Supabase (login, logout, reset, Google) | ✅ écrite — `src/supabaseAuth.js` |
| Synchronisation par org (découpe, réassemblage, temps réel) | ✅ écrite — `src/multiTenantSync.js` |
| Invariant « rien ne se perd au découpage » | ✅ vérifié à chaque `npm run audit` (`mtRoundtrip.mjs`) |
| Mots de passe en clair | ✅ **supprimés** — purgés par la migration, plus jamais écrits |
| Écrasement entre collègues | ✅ **corrigé** — fusion espace par espace |
| Branchement de `store.jsx` sur l'auth Supabase | ⛔ **reste à faire** (voir « Ce qui reste » plus bas) |
| Exécution du SQL, migration, rotation de clé | ⛔ **à vous** — étapes 1 à 6 ci-dessous |

## Le risque, en une phrase

La RLS de `app_state` est `using(true)`. La clé anon est **publique par construction** (elle
est livrée à chaque navigateur). N'importe qui peut donc lire et écrire **tout** le document —
tous vos clients confondus. Le chiffrement du blob arrête un scan opportuniste, pas quelqu'un
qui vise. **Aucune fonctionnalité ne compense cela** ; c'est le seul point qui empêche une
vente B2B sérieuse.

---

## Étape 0 — Sauvegarder (obligatoire, 2 min)

Supabase → SQL Editor :

```sql
create table if not exists public.app_state_backup as
  select id, data, updated_at, now() as backed_up_at from public.app_state where id = 'main';
select id, jsonb_typeof(data), backed_up_at from public.app_state_backup;  -- doit renvoyer 1 ligne
```

Puis `select data from app_state where id='main'` → bouton **Download** → gardez le fichier
`backup.json` en local. **Ne supprimez rien** tant que la bascule n'est pas validée.

## Étape 1 — Créer le schéma cible (additif, sans rien casser)

Exécuter `supabase/schema_multitenant.sql`. Il crée `profiles / orgs / org_members / org_state`
avec leur RLS. L'ancienne table `app_state` reste intacte : l'application continue de tourner
dessus tant que le drapeau est à `false`.

## Étape 2 — Activer l'authentification par e-mail

Supabase → Authentication → Providers → **Email** activé.
Désactivez les inscriptions publiques : les comptes sont créés à l'étape 3, puis par vous.

## Étape 3 — Migrer les comptes et découper le blob

```bash
# Prévisualiser — n'écrit RIEN :
node supabase/migrate_blob_to_orgs.mjs --blob=./backup.json

# Appliquer (la clé service_role reste dans votre terminal, jamais dans le dépôt) :
export SUPABASE_URL="https://xxxx.supabase.co"
export SUPABASE_SERVICE_ROLE="eyJ...service_role..."
node supabase/migrate_blob_to_orgs.mjs --blob=./backup.json --commit
```

Le script crée un compte Auth par utilisateur (**sans mot de passe** : chacun reçoit un lien
de réinitialisation — c'est cohérent avec la purge des clairs déjà faite), une org par
environnement, les appartenances, et l'`org_state` de chaque org.

## Étape 4 — Recette sur un projet de TEST, jamais en prod

Clonez les données dans un second projet Supabase, passez `FEATURES.multiTenant` à `true`
dans `src/supabaseConfig.js`, et vérifiez **en vous connectant avec de vrais comptes** :

- [ ] un utilisateur de l'org A n'obtient RIEN de l'org B — testez aussi en appelant l'API
      REST directement avec sa session, pas seulement via l'interface ;
- [ ] le temps réel fonctionne toujours entre deux membres d'une même org ;
- [ ] l'admin plateforme (`is_platform_admin`) voit bien l'ensemble ;
- [ ] un manager ouvre toujours l'espace de ses collaborateurs ;
- [ ] la résiliation et le mode lecture seule se comportent comme avant.

## Étape 5 — Bascule (fenêtre courte, annoncée à vos clients)

1. Nouvelle sauvegarde fraîche (étape 0).
2. Re-lancer le script de migration — il est idempotent — pour rattraper les écritures récentes.
3. Déployer avec `FEATURES.multiTenant = true`.
4. Fermer l'ancienne porte :

```sql
drop policy if exists "app_state_read"   on public.app_state;
drop policy if exists "app_state_insert" on public.app_state;
drop policy if exists "app_state_update" on public.app_state;
-- plus aucune policy ⇒ la clé anon n'a plus aucun accès à app_state.
```

## Étape 6 — Faire tourner la clé anon

Supabase → API → régénérer la clé anon, puis la remplacer (obfusquée) dans
`src/supabaseConfig.js` et dans le bloc `window.BDR_SUPABASE_*` de `site/index.html`.
**L'ancienne clé est publique depuis le premier jour** : tant qu'elle est valide, elle reste
utilisable par quiconque l'a relevée dans le bundle.

## Revenir en arrière

Tant que `app_state.main` existe et que sa RLS n'a pas été retirée (étape 5.4), il suffit de
redéployer avec `FEATURES.multiTenant = false`. Après l'étape 5.4, le retour passe par la
restauration du backup :

```sql
update public.app_state s set data = b.data
  from public.app_state_backup b where s.id = 'main' and b.id = 'main';
```

---

## Ce qui reste à écrire côté code

**`store.jsx` n'est pas encore branché sur l'authentification Supabase.** Le drapeau
`multiTenant` est donc aujourd'hui **inerte** : le passer à `true` ne changerait rien, ou
casserait la connexion. Ce branchement suppose trois choses :

1. l'écran de connexion appelle `signIn()` (`supabaseAuth.js`) au lieu de comparer un hash
   local, quand le drapeau est actif ;
2. `db` est assemblé par `assembleDb()` (`multiTenantSync.js`) à partir des `org_state`
   chargés, au lieu d'être lu d'un blob unique ;
3. les écritures sont routées vers la bonne org par `splitDb()`, et poussées ligne par ligne.

Ce travail n'a délibérément **pas** été fait à l'aveugle : il touche le chemin de connexion de
tout le monde et ne peut pas être éprouvé sans un vrai projet Supabase avec de vrais comptes.
Le faire sans pouvoir le tester exposerait à casser l'accès de tous les utilisateurs pour
fermer un trou qui, lui, ne se referme de toute façon qu'à l'étape 5.

**La bonne séquence est donc : étapes 0 à 3, puis le branchement, puis l'étape 4 (recette) sur
le projet de test.** Les étapes 0 à 3 sont réversibles et n'exposent rien de plus qu'aujourd'hui.

## Ce qui est déjà gagné, sans rien faire

Deux correctifs sont **actifs dès maintenant**, indépendamment de la bascule :

- **plus aucun mot de passe en clair** — ceux qui existaient sont effacés au premier
  chargement. Même si la base fuit, elle ne livre plus de mots de passe réutilisables ;
- **plus d'écrasement entre collègues** — la fusion se fait espace par espace.
