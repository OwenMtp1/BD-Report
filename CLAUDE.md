# BD Report — notes projet (handoff)

Espace sales tout-en-un pour BDR/SDR. **React 18 + Vite 5 + TailwindCSS 3 + Recharts + lucide-react**.
Pas de framework serveur : SPA front, état persistant en `localStorage`, synchro cloud optionnelle via Supabase.
UI **en français**. Repo GitHub : `OwenMtp1/BD-Report` (anciennement `OwenMtp1/Claude` — les URLs `/Claude/` redirigent).

## Démarrer / vérifier
```bash
npm install
npm run build      # build Vite -> dist/
npm run smoke      # test de fumée jsdom (rend l'app, traverse les écrans) — DOIT passer avant tout commit
npm run dev        # serveur de dev
```
`scripts/smoke.jsx` se connecte en OwenMtp / demo1234 → PeopleSpheres → Owen Mrani Bonnier → PIN 1205, puis traverse les pages. **Mets-le à jour quand tu ajoutes une page/feature.**

## Architecture
- **`src/store.jsx`** — cœur. `StoreProvider` + `useStore()`. Tout l'état dans un gros objet `db`
  (`accounts`, `environments`, `subenvs`, `data[subId]` = données par espace, + tableaux support globaux :
  `supportRequests`, `tickets`, `clients`, `projects`, `supportLogs`, `supportTrash`, `cannedReplies`, `kbArticles`).
  - `migrate(db)` tourne à chaque `load()` (idempotent) : valeurs par défaut, rétro-compat, **auto-seed** (clients/projets
    par environnement et par demande) suivi via `db._autoSeed` pour **ne créer qu'une fois** (sinon les suppressions « ressuscitent »).
  - `setSub(fn)` = écrit dans l'espace courant ; `setSubData(subId, fn)` = écrit dans un espace précis (pipeline entreprise).
    Les deux sont **bloqués en lecture seule** (`readOnly`, voir résiliation).
  - `APP_VERSION` (string), `ROLES`, `SUPPORT_ROLES = ['Fondateur','Support BD Report']`, `PLANS` (starter/beta), `BRICKS`.
- **`src/App.jsx`** — routing par `NAV_GROUPS` + `pageEl` (switch d'id). `MainApp` = sidebar + header.
  Login avec « rester connecté 30 j » + « enregistrer mot de passe ». Pastilles non-lus support. Bandeau lecture seule.
- **`src/i18n.jsx`** — dico FR/EN/ES (`useT()`), fallback FR.
- **`src/pages/*`** — Dashboard, Rdv, Leads (kanban + pipeline entreprise), Tasks, MyTasks, Contacts, Notes, Primes,
  Kpi, TeamLead, AiDashboard, Trash, Settings, Admin, OrgChart, Company.
  Support back-office (rôles support) : `Support` (client), `Requests` (Nouvelles demandes), `Tickets`, `TicketChat`,
  `Clients` (kanban), `Projects` (Gantt), `KnowledgeBase`, `SupportLogs`, `SupportTrash`.
- **`src/ui.jsx`** — Modal, Confirm (prop `yesLabel`), Field, Select, CommitInput/CommitTextarea (commit au blur = perf),
  toast/Toasts, confetti, DictateButton, etc.
- **`site/`** — site vitrine statique (index.html monofichier i18n FR/EN/ES, `securite.html`, `produit/*.html`, `assets/`).
  Le formulaire de contact écrit dans Supabase (`contact_requests`) sinon repli `localStorage` (clé `bdrflow_contact_inbox_v1`),
  ingéré par l'app dans « Nouvelles demandes ».

## Rôles, offres, support
- Rôles : `Fondateur`, `Support BD Report` (= mêmes droits que Fondateur), Administrateur, Manager, Développeur, Membre.
- Offres : `starter` (limité) / `beta` (complet). `allowedBricks(account)` = intersection bricks ∩ plan.
- Catégorie menu **« Support Client BD Report »** réservée à `SUPPORT_ROLES`. Onglet **Support** ouvert à tous.
- Tickets : priorité, assignation, SLA (1re réponse cible par priorité), CSAT à la clôture. Réponses types + base de connaissances.
- **Résiliation** (Paramètres → Gérer mes environnements → Résilier) : ouvre un ticket + passe l'env en `subState='cancelling'`
  → **lecture seule** (`readOnly`), briques transparentes, seul le Support éditable. Le support peut bloquer/débloquer/supprimer
  un env client depuis la fiche Clients (`subState` 'blocked'/'active').

## Supabase (synchro temps réel cross-device, optionnelle)
- Config : **`src/supabaseConfig.js`** (URL + clé anon, déjà renseignées) ; côté site : bloc `window.BDR_SUPABASE_*` dans `site/index.html`.
  Vide = 100 % local (inerte).
- Schéma SQL + guide : **`supabase/schema.sql`** et **`supabase/SETUP.md`**. Tables : `app_state` (tout l'état en JSONB,
  realtime, dernier-écrit-gagne, anti-écho par `_client`) et `contact_requests`.
- Logique : `src/supabaseSync.js` + effet dans `StoreProvider`. Au 1er chargement, **le distant fait foi s'il existe**.
  Bouton de test : Paramètres → Intégrations → « Tester la connexion ».
- 🔒 **Blob chiffré au repos** : `src/blobCrypto.js` (AES-256-GCM) chiffre l'état avant push Supabase et le déchiffre
  à la lecture/realtime (rétro-compatible avec l'ancien clair). Neutralise le pillage auto de la table via la clé anon.
  Limite : app 100 % front ⇒ clé livrée au client (protège du scan opportuniste, pas d'un attaquant ciblé). Vrai
  correctif = RLS par org (`supabase/schema_multitenant.sql` + `MIGRATION_MULTITENANT.md`, derrière `FEATURES.multiTenant`).
- ⚠️ **Sécurité** : les mots de passe sont stockés **uniquement hashés** (`account.password` = `sha256:…`) — plus aucun
  `passwordPlain` (purgé du blob par `migrate`). L'admin peut **réinitialiser** un mot de passe mais ne le voit jamais.
  RESTE À DURCIR avant prod publique : la RLS de `app_state` est `using(true)` → la clé anon (publique, livrée au client)
  permet de lire/écrire tout le blob. Vrai correctif = Supabase Auth + RLS `authenticated` (cf. `supabase/SETUP.md`).

## DÉPLOIEMENT — IMPORTANT
Le **proxy git de l'environnement de dev bloque la branche `gh-pages`** (seul le push de la branche de travail passe).
→ Le déploiement se fait donc **via GitHub Actions**, pas par push git local.
- **`.github/workflows/deploy-pages.yml`** : build l'app, inline en un seul fichier, assemble site (racine) + app (`/app`),
  publie sur `gh-pages` (peaceiris, `force_orphan`). **Se déclenche à chaque push** sur `claude/adoring-tesla-t0fwpc`,
  ou à la main (onglet Actions → « Run workflow »). Le workflow existe aussi sur `main` (requis pour le dispatch manuel).
- **`.github/workflows/desktop-release.yml`** : build l'app de bureau **Tauri** (Windows/macOS/Linux) et publie une release
  GitHub (tag `desktop-latest`). Déclencheur : tag `v*` ou manuel. ⚠️ Tauri : `src-tauri/Cargo.toml` désactive la feature
  `compression` de Tauri (`default-features=false, features=["wry"]`) pour éviter le crate `brotli` cassé.
- App live : `owenmtp1.github.io/Claude/app/` (ou `/BD-Report/app/`). Site : la racine.
- Déclencher/suivre via les outils GitHub MCP (`actions_run_trigger`, `actions_list`, `get_job_logs`).

## Conventions
- Travailler/commiter sur la branche **`claude/adoring-tesla-t0fwpc`** (le push y est autorisé).
- Finir chaque lot par `npm run build` + `npm run smoke` (doit être vert).
- Messages de commit en français, terminer par la ligne de session https://claude.ai/code/session_01TQYeMHDBAhMgz1SYCBwizb
- Ne pas mettre l'identifiant de modèle dans le code/commits.

## Pistes restantes (proposées, non faites)
Backend/auth Supabase durci + RLS par locataire ; notifications e-mail ; centre de notifs unifié ; import calendrier ;
signature de code desktop (Apple/Windows) ; mettre à jour `OwenMtp1/Claude` → `OwenMtp1/BD-Report` dans les liens si besoin.
