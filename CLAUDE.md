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
  - **Primes — 2 types** : par lead (`data.bareme` effectif × source, `computePrimes`, figée au passage SQL, règle du 15) ET
    par activité (`data.activityRules` = règles façon Excel : période semaine/mois/trimestre/année × phases × paliers « ≥ N RDV → montant »,
    `computeActivityPrimes(rdvs, rules)`). La page Primes fusionne les deux flux (suivi, reporting, prévisionnel).
- **`src/nav.jsx`** — **source unique des onglets** : `NAV_GROUPS` (avec un `brick` sur chaque onglet accordable),
  `GRANTABLE_TABS` (liste dérivée pour l'éditeur d'offres), `ALL_BRICKS` (= `store.BRICKS`), `LEGACY_BRICKS`.
  Ajouter un onglet ici l'ajoute automatiquement partout : nav, éditeur d'offres, page Souscrire, éditeur de briques par
  utilisateur. `migrate` accorde les nouveaux onglets à l'offre Beta + aux comptes en accès complet.
- **`src/App.jsx`** — routing par `NAV_GROUPS` (importé de nav.jsx) + `pageEl` (switch d'id). `MainApp` = sidebar + header.
  Login avec « rester connecté 30 j » + « enregistrer mot de passe ». Pastilles non-lus support. Bandeau lecture seule.
- **`src/i18n.jsx`** — dico FR/EN/ES (`useT()`), fallback FR.
- **`src/pages/*`** — Dashboard, Rdv, Leads (kanban + pipeline entreprise), Tasks, MyTasks, Contacts, Notes, Primes,
  Kpi, TeamLead, Trash, Settings, Admin, OrgChart, Company, **Conversations**, **DataQuality** (Qualité des données :
  score /100 + checks téléphone/email/doublons/prochaine action/inactivité), **Classement** (gamification équipe :
  6 critères, podium, badges Hot Streak/Objectif/2000€/+30%), **Simulateur** (« Combien vais-je toucher ? » : jauge
  circulaire à curseur draggable, échelle +1000%, prime acquise/probable/potentielle, SQL manquants). (Ancien `AiDashboard` retiré.)
  **Conversations** (`src/pages/Conversations.jsx`, prop `scope` 'team'/'support') : canaux de discussion + canaux de
  **reporting automatique** (BD Report poste chaque RDV/étape/gagné/perdu côté équipe, tickets/projets/churn côté support ;
  le manager/fondateur choisit les événements ET les champs affichés). Accès sectorisé (tout le monde / par service /
  membres choisis), images, **fichiers**, réactions émoji. **Actions par message** : répondre, transférer, épingler
  (pour moi / pour tout le monde), supprimer (pour moi / pour tout le monde), marquer comme non lu. **Présence** par
  utilisateur (`account.presence` en ligne/hors ligne/ne pas déranger — dnd coupe les notifs) via bulle sur l'avatar +
  fiche profil (clic avatar). **Non-lus** : pastille onglet + par canal, notifs centre de notifs ; **mute** par canal
  (`account.mutedChannels`). Canaux **auto-créés** (une fois, `db._autoSeed.generalChannels/blocNotes`) : « Général »
  (tous les profils) par env + « Bloc notes » personnel par personne (`channel.personal`, visible du seul propriétaire).
  **Suppression** : DM & bloc-notes entièrement supprimables ; les groupes (≥ 2 interlocuteurs) offrent « supprimer pour moi »
  (`account.hiddenChannels` = { canalId: date } — réapparaît au prochain message) ou « quitter le groupe » (`account.leftChannels`,
  définitif) ; le manager garde « supprimer pour tout le monde ». `store.isGroupChannel/hideChannelForMe/leaveChannel/isChannelHiddenForMe`.
  Store : `db.channels` + `db.channelMessages`, `reconcileReporting(db)` + `seedAutoChannels(db)` (idempotents),
  méthodes `createChannel/updateChannel/postChannelMessage/forwardChannelMessage/deleteMessageFor{All,Me}/pinMessageFor{All,Me}/
  markChannelUnreadFrom/toggleChannelReaction/channelMembers/setPresence/markChannelRead/channelUnread/…`.
  **Services (organigramme)** : `env.services` + `subenv.serviceId` (équipe), `db.staffServices` + `account.staffServiceId`
  (staff/support) — édition dans OrgChart, Admin (onglet « Services & organigramme »), Settings (Gérer mes environnements),
  Conversations (« Services du staff »). **OrgChart** (`src/pages/OrgChart.jsx`) : arbre récursif basé sur `account.teamOf` ;
  mode « Modifier l'organigramme » (manager+) = glisser-déposer / menu « Rattaché à » (`store.setManagerOf(subId, managerSubId)`,
  anti-cycle), manager principal (`env.createdBy`) en tête. Staff/fondateur/admin peuvent nommer/retirer un manager
  (`store.setEmployeeRole(subId, makeManager)`). Membres de conversation cliquables → fiche `CollaboratorCard` (via `open-collaborator`). **Mots de passe** : `account.passwordClear` conservé (visible manager/support/
  fondateur via `revealPassword`) EN PLUS du hash `password` (auth) — voir ⚠️ sécurité ci-dessous.
  Support back-office : **`SupportHub`** (onglet unique « Équipe support », rôles support) = console à onglets qui
  regroupe `Requests`/`Tickets`/`TicketChat`/`Clients`/`Projects`/`KnowledgeBase`/`SupportLogs`/`SupportTrash` + KPI.
  `Support` (client) reste dans « Mes données ». Menu simplifié : 5 catégories (Pilotage, Activité, Mes données,
  Administration, Support Client BD Report).
- **`src/ui.jsx`** — Modal, Confirm (prop `yesLabel`), Field, Select, CommitInput/CommitTextarea (commit au blur = perf),
  toast/Toasts, confetti, DictateButton, etc.
- **`site/`** — site vitrine statique (index.html monofichier i18n FR/EN/ES, `securite.html`, `produit/*.html`, `assets/`).
  Le formulaire de contact écrit dans Supabase (`contact_requests`) sinon repli `localStorage` (clé `bdrflow_contact_inbox_v1`),
  ingéré par l'app dans « Nouvelles demandes ».

## Rôles, offres, support
- Rôles : `Fondateur`, `Support BD Report` (= mêmes droits que Fondateur), Administrateur, Manager, Développeur, Membre.
- **Permissions staff (`db.staffRoles`)** : chaque rôle (intégré ou personnalisé) = `{id, name, roleKey, rank, builtin, permissions[]}`.
  Catalogue EXHAUSTIF des droits côté staff dans `STAFF_PERMISSION_GROUPS`/`STAFF_PERMISSIONS`/`STAFF_PERMISSION_IDS` (store.jsx) :
  tickets (view/reply/assign/priority/status/delete), demandes, KB & réponses types, clients, projets & mise en place,
  comptes & accès (create/role/offer/disable/wipe/remove), mots de passe (view/reset), offres & abonnements, services &
  organigramme, outils (logs/trash/stats + **démo/visite guidée**), gouvernance (`permissions.manage`). `seedStaffRoles(db.staffRoles)`
  (idempotent, dans `migrate`) garantit les 6 rôles intégrés + **Fondateur = tous droits en dur** (anti-lockout). Helpers :
  `accountHasPerm(account, permId, db)`, `roleRankOf(role, db)`, `ROLE_RANKS`. Store : `hasPerm(permId)`, `roleRank`, `allRoles()`,
  `canManageRole(target)`, `createStaffRole/updateStaffRole/toggleRolePerm/deleteStaffRole/setAccountRole`.
  **Gouvernance** : seul le Fondateur gère tout ; un rôle porteur de `permissions.manage` gère les rôles de **rang strictement
  inférieur** au sien et **n'accorde que des droits qu'il détient** (anti-escalade). Page **`StaffPermissions`** = onglet
  « Permissions staff » de `SupportHub` (visible si `permissions.manage`) : matrice droits×rôles + création/renommage/rang/suppression
  de rôles + attribution aux comptes. Les onglets de `SupportHub` portent chacun une `perm` (filtrés par `hasPerm`). Les gardes
  store staff-only (offres, `accounts.offer/disable/wipe/remove`, `canViewPasswords`) passent par `accountHasPerm`. L'éditeur de
  rôles d'`Admin` liste `store.allRoles()` (rôles personnalisés inclus).
- **Offres = données** (`db.offers`, staff-managées) : `defaultOffers()` seed starter/beta. Chaque offre a
  `{bricks, team, maxSeats, price, priceLabel, desc}`. `allowedBricks(account, offers)` = bricks du compte ∩ offre
  (aucune si pas d'offre → support seul). `hasTeamAccess(account, offers)` = offre `team` ou rôle support ; les onglets
  pilotage/manager/admin sont `team:true` (cachés en Starter). Nav gate par offre : items `always:true` (Support,
  Souscrire) visibles sans offre. Starter = solo (`addAccount` bloqué). Console Support → onglet **Offres**
  (`OffersAdmin`, CRUD) alimente en direct la page **Souscrire** (`src/pages/Souscrire.jsx` → ouvre un ticket).
  **Sync site↔app** : l'app publie `db.offers` en clair (marketing, non secret) — miroir `localStorage['bdrflow_offers_v1']`
  + Supabase `app_state.id='offers'` (`publishOffersDebounced`) ; le site (`#plansHost`) régénère ses cartes de prix
  depuis ces offres (repli : cartes statiques trilingues). La **démo** (`buildDemoDb`) est une société fictive « Atlas
  Revenue » fabriquée de toutes pièces (aucun lien avec le compte réel).
  Staff : Projets → bouton **Utilisateurs** (env) = offre de l'env, rôle manager, désactiver l'accès
  (`account.disabled`, login refusé), voir/changer mot de passe, effacer les données, retirer un membre.
  Manager (Gestion Administration mode `teams`) : périmètre strict (son équipe, jamais le staff).
- Catégorie menu **« Support Client BD Report »** réservée à `SUPPORT_ROLES`. Onglet **Support** ouvert à tous.
- Tickets : priorité, assignation, SLA (1re réponse cible par priorité), CSAT à la clôture. Réponses types + base de connaissances.
- **Résiliation** (Paramètres → Gérer mes environnements → Résilier) : ouvre un ticket + passe l'env en `subState='cancelling'`
  → **lecture seule** (`readOnly`), briques transparentes, seul le Support éditable. Le support peut bloquer/débloquer/supprimer
  un env client depuis la fiche Clients (`subState` 'blocked'/'active').

## Supabase (synchro temps réel cross-device, optionnelle)
- Config : **`src/supabaseConfig.js`** (URL + clé anon) ; côté site : bloc `window.BDR_SUPABASE_*` dans `site/index.html`.
  Vide = 100 % local (inerte). **Clés obscurcies** (XOR+base64 via `src/obf.js` / `bdrDeob` côté site) : plus aucune clé
  en clair dans le repo ni le build (anti-scan). Pour changer une clé : régénérer la valeur obfusquée (XOR pad `bdreport-obf-2026-v1`).
  ⚠️ Obscurcissement ≠ secret (app front, clé reconstruite au client) : vraie confidentialité = RLS.
- Schéma SQL + guide : **`supabase/schema.sql`** et **`supabase/SETUP.md`**. Tables : `app_state` (tout l'état en JSONB,
  realtime, dernier-écrit-gagne, anti-écho par `_client`) et `contact_requests`.
- Logique : `src/supabaseSync.js` + effet dans `StoreProvider`. Au 1er chargement, **le distant fait foi s'il existe**.
  Bouton de test : Paramètres → Intégrations → « Tester la connexion ».
- 🔒 **Blob chiffré au repos** : `src/blobCrypto.js` (AES-256-GCM) chiffre l'état avant push Supabase et le déchiffre
  à la lecture/realtime (rétro-compatible avec l'ancien clair). Neutralise le pillage auto de la table via la clé anon.
  Limite : app 100 % front ⇒ clé livrée au client (protège du scan opportuniste, pas d'un attaquant ciblé). Vrai
  correctif = RLS par org (`supabase/schema_multitenant.sql` + `MIGRATION_MULTITENANT.md`, derrière `FEATURES.multiTenant`).
- ⚠️ **Sécurité — mots de passe** : `account.password` reste un hash `sha256:…` (auth). À la demande explicite du
  propriétaire, un `account.passwordClear` (clair) est aussi conservé pour permettre au **manager/support/fondateur**
  d'afficher le mot de passe (bouton œil dans Gestion Administration, `store.revealPassword`). Compromis assumé : le clair
  est reprotégé au repos par le chiffrement du blob (`blobCrypto`) côté Supabase, mais reste récupérable côté client — la
  vraie confidentialité passerait par Supabase Auth + RLS. Les anciens mots de passe déjà purgés (sans `passwordClear`)
  ne sont **pas** récupérables : il faut les réinitialiser pour les rendre visibles. L'ancien `passwordPlain` reste purgé.
  **Aucun mot de passe en clair dans le code** : les comptes de démo (`buildSeedDb` compte '01', `injectTestEnv`) portent
  un hash `sha256:…` en dur (jamais le clair) ; seuls les comptes créés/réinitialisés dans l'app ont un `passwordClear`.
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
  Domaine perso **`bdreport.js.org`** (js.org, gratuit) : fichier `CNAME` généré par le workflow ; une fois la
  PR js.org fusionnée, le site sert à la racine du domaine. Toutes les URLs SEO (canonical/OG/sitemap) pointent dessus.
- Déclencher/suivre via les outils GitHub MCP (`actions_run_trigger`, `actions_list`, `get_job_logs`).

## Conventions
- Travailler/commiter sur la branche **`claude/adoring-tesla-t0fwpc`** (le push y est autorisé).
- Finir chaque lot par `npm run build` + `npm run smoke` (doit être vert).
- Messages de commit en français, terminer par la ligne de session https://claude.ai/code/session_01TQYeMHDBAhMgz1SYCBwizb
- Ne pas mettre l'identifiant de modèle dans le code/commits.

## Pistes restantes (proposées, non faites)
Backend/auth Supabase durci + RLS par locataire ; notifications e-mail ; centre de notifs unifié ; import calendrier ;
signature de code desktop (Apple/Windows) ; mettre à jour `OwenMtp1/Claude` → `OwenMtp1/BD-Report` dans les liens si besoin.
