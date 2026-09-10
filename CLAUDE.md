# BD Report — notes projet (handoff)

Espace sales tout-en-un pour BDR/SDR. **React 18 + Vite 5 + TailwindCSS 3 + Recharts + lucide-react**.
Pas de framework serveur : SPA front, état persistant en `localStorage`, synchro cloud optionnelle via Supabase.
UI **en français**. Repo GitHub : `OwenMtp1/BD-Report` (anciennement `OwenMtp1/Claude` — les URLs `/Claude/` redirigent).

## Démarrer / vérifier
```bash
npm install
npm run build      # build Vite -> dist/
npm run smoke      # test de fumée jsdom (rend l'app, traverse les écrans) — DOIT passer avant tout commit
npm run audit      # audit structurel : démo complète, catalogues de droits, contraste sombre,
                   # RETRAIT de chaque module, atterrissage, territoires, récap hebdo,
                   # AUCUN mot de passe en clair, fusion des états distants,
                   # invariant de découpage multi-tenant, couverture i18n
npm run dev        # serveur de dev
```
`scripts/smoke.jsx` se connecte en OwenMtp / demo1234 → PeopleSpheres → Owen Mrani Bonnier → PIN 1205, puis traverse les pages. **Mets-le à jour quand tu ajoutes une page/feature.**

## Architecture
- **`src/store.jsx`** — cœur. `StoreProvider` + `useStore()`. Tout l'état dans un gros objet `db`
  (`accounts`, `environments`, `subenvs`, `data[subId]` = données par espace, + tableaux support globaux :
  `supportRequests`, `tickets`, `clients`, `projects`, `supportLogs`, `supportTrash`, `cannedReplies`, `kbArticles`).
  - `migrate(db)` tourne à chaque `load()` (idempotent) : valeurs par défaut, rétro-compat, **auto-seed** (clients/projets
    par environnement et par demande) suivi via `db._autoSeed` pour **ne créer qu'une fois** (sinon les suppressions « ressuscitent »).
    ⚠️ **Créer et MARQUER ne se séparent jamais** : `seedEnvClientAndProject(db, env)` fait les deux, et c'est le
    SEUL chemin (migration comme `createEnv`). Tant que les deux gestes vivaient à deux endroits, l'un a fini par
    oublier l'autre — `createEnv` posait le projet sans l'inscrire, et le rechargement suivant recréait le projet
    que l'utilisateur venait de supprimer.
    ⚠️ **`_autoSeed` se RÉUNIT à la synchro, il ne se remplace pas** (`unionAutoSeed`, appelé par `mergeRemoteDb`).
    Un repère est un FAIT (« ceci a déjà été créé une fois ») : le perdre ne peut produire qu'une résurrection.
    La photo d'un collègue prise avant le semis ramenait des repères vides → le projet revenait à CHAQUE synchro.
    `_autoSeed.envSeedBackfill` rattrape une fois les bases déjà en service : dans une base qui porte déjà des
    repères, un environnement présent a forcément eu son projet — son absence est une suppression, pas un oubli.
  - **Supprimer une livraison SUPPRIME SON ENVIRONNEMENT** — `archiveDelivery(d, {projectId|envId, reason, actor})`,
    chemin UNIQUE de `store.deleteProject` ET de `store.deleteClientEnv`. Un projet EST la livraison d'un
    environnement : retirer la fiche seule laissait l'environnement vivant pour son équipe et invisible depuis la
    console — « des environnements qui se baladent », le pire des deux états. Tout (projet, env, sous-espaces,
    `data`) part dans `db.supportTrash` (`kind: 'project'`, 30 jours), `restoreDelivery` le rend à l'identique,
    et la fiche client RESTE, classée « anciens » : elle porte l'histoire du départ.
    Chaque suppression **ouvre un ticket** `PROJECT_CLOSURE_CATEGORY` (« Fermeture de projet ») rattaché au
    **propriétaire du projet** (à défaut, à qui supprime), non lu des deux côtés — le fil où se règle un litige.
    ⚠️ **Pierre tombale `db._envTombstones[envId] = {deletedAt, restoredAt}`** : une suppression est un FAIT, comme
    un repère de semis, et doit voyager avec l'état. `mergeRemoteDb` la respecte (`mergeEnvTombstones`, la date la
    plus récente gagne — une restauration lève la pierre) et `migrate` l'applique à chaque chargement, sinon la
    photo périmée d'un collègue ramenait l'environnement à la synchro suivante. Purge à 90 jours.
    ⚠️ `afterStamp` : deux gestes dans la MÊME milliseconde (restaurer puis resupprimer) se départageaient au
    hasard — le dernier est daté strictement après le précédent.
    `store.orphanEnvs()` liste les environnements sans livraison, montrés en bandeau dans le panneau Projets
    (« Rouvrir la livraison » via `recreateDelivery`, ou archiver). **Jamais de purge automatique** : une migration
    qui efface des données client est pire que le désordre qu'elle corrige.
  - `setSub(fn)` = écrit dans l'espace courant ; `setSubData(subId, fn)` = écrit dans un espace précis (pipeline entreprise).
    Les deux sont **bloqués en lecture seule** (`readOnly`, voir résiliation).
  - ⚠️ **Sauvegarde différée (400 ms)** : `JSON.stringify` de tout l'état coûte cher dès qu'une équipe a de
    l'historique, et bien plus quand des images/fichiers circulent dans les conversations. L'écrire à chaque
    changement figeait l'interface le temps de la sérialisation — les clics tombés pendant ce gel étaient perdus
    (boutons « qui ne font rien », kanban haché). Les changements rapprochés sont regroupés en une écriture,
    vidée aussi sur `pagehide`, `visibilitychange` et au démontage du provider. `window.__bdrFlushSave()` force
    l'écriture (utilisé par le smoke : **toute lecture de `localStorage` dans un test doit passer par `dbNow()`**,
    sinon elle relit l'état d'avant la dernière action).
  - `APP_VERSION` (string), `ROLES`, `SUPPORT_ROLES = ['Fondateur','Support BD Report']`, `PLANS` (starter/beta), `BRICKS`.
  - **Primes — 2 types** : par lead (`data.bareme` effectif × source, `computePrimes`, figée au passage SQL, règle du 15) ET
    par activité (`data.activityRules` = règles façon Excel : période semaine/mois/trimestre/année × phases × paliers « ≥ N RDV → montant »,
    `computeActivityPrimes(rdvs, rules)`). La page Primes fusionne les deux flux (suivi, reporting, prévisionnel).
- **`src/nav.jsx`** — **source unique des onglets** : `NAV_GROUPS` (avec un `brick` sur chaque onglet accordable),
  `GRANTABLE_TABS` (liste dérivée pour l'éditeur d'offres), `ALL_BRICKS` (= `store.BRICKS`), `LEGACY_BRICKS`.
  Ajouter un onglet ici l'ajoute automatiquement partout : nav, éditeur d'offres, page Souscrire, éditeur de briques par
  utilisateur. `migrate` accorde les nouveaux onglets à l'offre Beta + aux comptes en accès complet.
  Un item peut porter `inManagerHub: true` (masqué de la barre latérale, rendu comme onglet de **`ManagerHub`** — il reste
  déclaré ici, donc toujours accordable par une offre) et `perm: '<droit staff>'` (ouvre l'onglet même si le rôle n'est pas
  dans `roles`, et court-circuite la garde par brique). `MANAGER_TABS` = les items `inManagerHub`. **Deux items ne doivent
  jamais partager la même brique** : `GRANTABLE_TABS` la prend pour clé et React signalerait un doublon.
- **`src/App.jsx`** — routing par `NAV_GROUPS` (importé de nav.jsx) + `pageEl` (switch d'id). `MainApp` = sidebar + header.
  **`SubEnvPicker`** : sans droit d'encadrement (`team.view`/`team.manage`), seul SON espace est ouvrable — ceux des
  collègues portent un cadenas et sont inertes. Le code PIN protège d'un regard, il n'autorisait pas à entrer chez
  un autre. Avec le droit, tous les espaces restent accessibles, PIN demandé.
  Login avec « rester connecté 30 j » + « enregistrer mot de passe ». Pastilles non-lus support. Bandeau lecture seule.
  **Connexion Google** (Supabase Auth, provider google) : bouton « Continuer avec Google » → `signInWithGoogle()`
  (`src/supabaseAuth.js`) ; au retour, `detectSessionInUrl` pose la session et `store.loginWithGoogle(email)` rattache
  l'identité à un compte par son **e-mail**. **Aucune création implicite** : une adresse sans compte est refusée et la
  session Supabase refermée (les accès restent délivrés par un manager, sinon les sièges d'une offre seraient contournés).
  `logout()` ferme aussi la session Supabase, sans quoi l'écran de connexion la retrouverait aussitôt. Côté Google Cloud :
  l'URI de redirection est celle de **Supabase** (`https://<ref>.supabase.co/auth/v1/callback`), pas celle du site.
- **Traduction FR / EN / ES — TOUTE l'interface change de langue.** Deux étages :
  - **`src/i18n.jsx`** — petit dico à clés (`useT()`, `tLang()`), fallback FR. Sert aux quelques
    libellés construits hors rendu (navigation, écran de connexion).
  - **`src/i18nAuto.js` + `src/i18nDict.js`** — le reste, c'est-à-dire l'essentiel. Les 54 écrans sont
    écrits en français EN DUR : les envelopper un par un dans un `t('cle')` supposait ~1 500 modifications,
    et surtout chaque phrase ajoutée ensuite serait restée en français sans que personne ne le voie. On
    prend donc le problème par l'autre bout — **le texte français EST la clé**, et la traduction s'applique
    au rendu. `installUITranslator(lang)` (appelé par `I18nProvider` à chaque changement de langue) parcourt
    le DOM, traduit les nœuds de texte et 4 attributs visibles (`placeholder`, `title`, `aria-label`, `alt`),
    puis suit les rendus suivants via un `MutationObserver` regroupé au cadre suivant.
    ⚠️ Il ne touche **jamais** la `value` d'un champ (ce serait modifier une donnée), ni un sous-arbre
    portant `data-no-i18n`, ni `SCRIPT/STYLE/TEXTAREA/CODE/PRE`. Le français d'origine est mémorisé
    (`WeakMap`) : revenir au français **restitue** le texte au lieu de le retraduire.
    ⚠️ **On mémorise aussi le texte POSÉ** : React réécrit le contenu d'un nœud existant chaque fois
    qu'une valeur interpolée change (compteur, montant, statut). Sans ce repère, la passe suivante
    repartait du français mémorisé et réécrivait l'ANCIENNE valeur par-dessus la nouvelle — hors
    français, tout ce qui se met à jour en place cessait de se mettre à jour. Si le texte présent
    n'est plus celui qu'on a posé, c'est React qui a parlé : son texte devient le nouvel original.
    ⚠️ **Coût** : l'observateur ne fait visiter QUE les sous-arbres qu'il signale (une passe complète
    du document coûtait ~8 000 nœuds pour une ligne modifiée, à chaque frappe), et **en français
    rien n'est surveillé du tout** — la langue par défaut ne paie pas pour le reste.
    ⚠️ **Le texte affiché est traduit : il ne doit jamais servir de VALEUR.** Un `<option>` sans
    attribut `value` prend son texte pour valeur — en anglais, choisir « Signed » écrirait « Signed »
    dans les données. `npm run audit` refuse tout `<option>` sans `value`.
    ⚠️ Un attribut ne se découpe pas en nœuds : un libellé composé (`${label} — lecture seule`) doit
    traduire ses morceaux avec `trUI(fr, lang)` **avant** de les assembler.
    Effet de bord assumé : une valeur saisie par le client qui coïncide mot pour mot avec une entrée
    du dictionnaire est traduite à l'affichage (aujourd'hui : l'étape « Signée », le rôle « Manager »,
    le rôle d'achat « Utilisateur »). La donnée stockée, elle, reste le français.
    ⚠️ **Une phrase recollée avant l'affichage ne se traduit pas** (`gaps.join(' · ')` produit un seul
    nœud, absent du dictionnaire) : rendre chaque fragment dans son propre élément.
  - **`src/i18nDict.js`** — `UI_DICT = [[fr, en, es], …]`, ~1 500 entrées. La clé doit correspondre
    **au caractère près** au texte rendu (entités `&apos;` décodées comprises) ; une clé approximative ne
    traduit rien, en silence.
  - **Contrôle** : `npm run i18n:missing` (et la dernière ligne de `npm run audit`) extrait les chaînes
    d'interface de `src/**/*.jsx` — texte JSX, props d'affichage, `toast(…)`, et libellés déclarés en objet
    (`{ label: '…' }`) — et liste ce qui manque au dictionnaire. **Doit rester à 100 %.** Le smoke complète
    par un contrôle À L'EXÉCUTION (`window.__bdrI18nMissing`) : bascule EN puis ES sur l'écran des RDV, et en
    fin de parcours **balayage de TOUS les onglets en anglais** — c'est là que se voient les phrases qu'aucun
    écran testé en anglais ne montrait. Le contenu SAISI (notes, messages) est écarté en le retrouvant dans la
    base : une donnée reste dans la langue de qui l'a écrite, la traduire serait la réécrire.
- **`src/themes.js`** — **4 thèmes seulement** : `ocean-pro` (design BD Report d'origine, défaut), `sombre`,
  `nuit`, et **`bdr-studio`** (quasi-noir, **vert néon** en accent principal et cyan en second : cartes en verre,
  halos, chiffres lumineux, et **tableaux soignés** — en-tête tenu au défilement, lignes alternées, liseré vert sur
  la ligne survolée, colonnes numériques à chasse fixe via la classe `num`). Les 17 variantes colorées et les fonds animés ont été retirés — ils multipliaient
  les rendus à vérifier sans rien apporter. Un thème peut porter un **`skin`** : `applyTheme` pose alors
  `skin-<nom>` sur `<html>`, et le CSS (fin de `src/index.css`) change les **formes** — rayons, dégradés de
  boutons, chiffres colorés, pastilles d'icônes, navigation. Ajouter un skin = une entrée ici + un bloc CSS,
  aucun écran à refaire. `migrate` ramène toute préférence pointant vers un thème disparu sur `ocean-pro`.
- **`src/kbContent.js`** — contenu de la base de connaissances : `KB_CATEGORIES` (11 catégories avec emoji et
  description) et `KB_ARTICLES` (~45 articles, chacun avec un `id` **stable**, une `category` et des `keywords`
  élargissant la recherche aux mots que les clients emploient). `migrate` publie les articles **une seule fois**
  (`db._autoSeed.kbPublished` = liste d'ids) : un article retouché par le support n'est jamais écrasé et un article
  supprimé ne ressuscite pas. Ajouter un article = une entrée ici, rien d'autre. Côté client (`Support.jsx`,
  `KbBrowser`) : entrée par catégorie cliquable ou par recherche ; côté staff (`KnowledgeBase.jsx`) : filtre par
  catégorie, recherche et édition des mots-clés.
- **Formation staff** — **`TrainingJourney`** monte la VRAIE app dans un `StoreProvider demo dataset="training"`
  (isolé, sans persistance) alimenté par **`buildTrainingDb()`** : équipe support, 7 entreprises clientes aux
  situations contrastées, 12 tickets à tous les stades (dont un urgent non pris), 3 demandes entrantes, notes de
  satisfaction produit dont deux basses (client à risque), projets à paramétrer et un projet clôturé avec motif.
  `trainingSession()` ouvre la session support. **Entrée par le choix d'une casquette staff** : les rôles réels
  (`store.staffRoles()` du provider PARENT) sont passés à la db de formation (`datasetRole`/`datasetRoles`), si bien
  que l'espace reflète les droits en vigueur. **Parcours guidé** dont chaque étape porte la `perm` qu'elle suppose —
  les étapes hors de portée du rôle sont retirées, guider vers un écran interdit apprendrait l'inverse du bon geste.
  `demo-navigate` change d'onglet, `hub-tab` cible l'onglet interne de `SupportHub`.
  **Pages dédiées** : la formation vit sur **`#/formation`** et la démo commerciale sur **`#/demo`** — `main.jsx`
  y monte `TrainingJourney` / `DemoJourney` **À LA PLACE** de `App`. Aucune des deux n'est un calque : deux
  applications montées côte à côte écoutaient les mêmes événements (`demo-navigate`) et se disputaient la main, ce
  qui faisait dérailler les parcours guidés. `openTrainingPage()` (`StaffTraining.jsx`) et `openDemoPage()`
  (`DemoSales.jsx`) ouvrent la page dans un nouvel onglet, avec repli sur la page courante.
  Le smoke monte chacune de ces pages seule et **déroule son parcours guidé jusqu'à « Terminer »** : une étape qui
  plante fait tomber le test.
  **Accès libre** : un lien de l'écran de connexion l'ouvre sans authentification (environnement isolé, données
  fictives) — au prix de rendre la structure de la console support visible à tout visiteur.
- **`src/trainingContent.js` + `src/pages/StaffTraining.jsx`** — onglet **« Formation staff »** de `SupportHub`
  (perm `demo.access`) : espace d'entraînement à cas fictifs — 10 projets (dont plusieurs « à paramétrer » avec leur
  liste de tâches), 12 cas de support couvrant tous les sujets avec la leçon à retenir, et une discussion de projet
  difficile (demandes de rôles que le produit ne sait pas satisfaire). **Rien n'est enregistré ni synchronisé** :
  l'état vit le temps de la session, volontairement.
- **Organigrammes** — **`StaffOrgChart`** (onglet « Organigramme staff » de `SupportHub`, perm `services.manage`) :
  arbre de l'équipe BD Report par `account.teamOf`, glisser-déposer (`store.setStaffManager`, anti-cycle), services
  staff, **rôle staff modifiable sur chaque carte** (liste bornée par `canManageRole`). Le **contenu** d'un rôle
  (ce qu'il a le droit de faire) reste dans « Permissions staff », un seul endroit pour donner ou retirer un accès.
  Panneau **« Ajouter quelqu'un à l'équipe »** (composant `Recruit`), deux entrées : *Depuis un environnement*
  (`store.clientAccountsByEnv()` → `store.joinStaff(accId, role, teamOf)` : le compte garde son espace client, seul
  son rôle bascule) et *Créer un profil* (`store.createStaffAccount({email, pseudo, password, role, teamOf,
  staffServiceId})` → renvoie `{account}` ou `{error}`). `createStaffAccount` **ne passe pas par `addAccount`** :
  celui-ci consomme un siège de l'offre du client courant, ce qui n'a pas de sens pour un collègue de l'éditeur.
  Gardes : `accounts.create` / `accounts.role` (les boutons hors de portée sont absents, pas inertes),
  `canManageRole` sur le rôle visé, e-mail et pseudo uniques, mot de passe hashé (+ `passwordClear`).
  `store.staffRoleKeys()` = rôles attribuables côté staff (tout sauf `CLIENT_ROLE_KEYS`).
  **`OrgChart`** accepte un `envId` : sans lui il montre l'environnement courant (vue client), avec lui celui d'un
  client (vue staff). **`ProjectOrgChart`** n'est plus qu'un habillage — barre de retour + panneau « Rôles et accès »
  — autour de ce même composant : **une seule implémentation de l'arbre**, donc une correction vaut pour les deux.
  Services via `addEnvService/renameEnvService/removeEnvService` et rattachement via `setSubManager` (les méthodes
  historiques visaient l'env COURANT, inadapté au staff). **Rôles par environnement** :
  `env.roles = [{id, name, color, builtin, tabs[], perms[]}]`, `seedEnvRoles` garantit Manager et Membre partout,
  `CLIENT_PERMISSION_GROUPS`/`CLIENT_PERMISSION_IDS` = droits de management, `tabs` = bricks visibles,
  `subenv.roleId` = rôle porté. `store.envRoles/saveEnvRoles/assignSubRole`. Le panneau travaille sur un **brouillon**
  appliqué en une fois après confirmation. ⚠️ Les `tabs` d'un rôle **restreignent EN PLUS de l'offre** dans
  `canSee` (`store.myEnvRole()`), et `store.hasClientPerm(id)` lit ses `perms` (repli sur `account.role` sans rôle
  attribué) : un sous-espace sans `roleId` n'est pas restreint, et le staff n'est jamais filtré.
- **`src/pages/Ecosystem.jsx`** — onglet **« Créer votre écosystème »** de `ManagerHub` (brick `Écosystème`) : le
  manager compose ses **étapes de pipeline** (`data.phases`, ordonnables, renommables), coche celles qui
  **déclenchent une prime** (`data.primePhases`), fixe le **jour de bascule** du mois de paiement
  (`data.primeCutoffDay`, ex-« règle du 15 » écrite en dur) et règle son **barème**. ⚠️ `computePrimes(rdvs, bareme,
  {triggerPhases, cutoffDay})` et `primePaymentMonth(date, cutoff)` lisent ces réglages — **tous les appelants doivent
  les passer**, sinon le paramétrage reste décoratif. `store.renamePhase` reporte un renommage sur les RDV ET sur
  `primePhases`, faute de quoi les primes cesseraient d'être calculées sans explication.
- **Contacts communs** — `store.envContacts()` agrège les contacts de TOUS les espaces de l'environnement
  (dédoublonnés par e-mail, `owners[]` = qui les a déjà travaillés) ; `store.importEnvContacts()` reprend dans son
  espace ceux qu'on n'a pas. Le formulaire de RDV (`ContactSearch` dans `Rdv.jsx`) cherche dans cette base : choisir
  un contact connu remplit nom/poste/e-mail/téléphone et signale s'il est déjà travaillé par un collègue.
- **`src/pages/ManagerHub.jsx`** — console **« Gestion Manager »** (nav Administration, brick homonyme, perm `manager.view`
  accordée à tout le staff) : réunit ce qu'un manager est seul à voir — Utilisateurs (`Admin` en périmètre d'équipe),
  Organigramme, Pilotage équipe, KPI Entreprise, Intégration HubSpot. Les onglets viennent de `MANAGER_TABS`, filtrés par les
  briques de l'offre. La **vue globale** (tous les comptes, tous les environnements) a quitté le client pour l'onglet
  « Comptes & environnements » de `SupportHub` (perm `accounts.view`) : côté client elle exposait les comptes des autres
  entreprises clientes (`Admin.jsx`, mode `admin`, ne filtrait sur aucun environnement).
- **Modules optionnels par environnement** — `ENV_MODULES` (store.jsx) : `handoff`, `closing`, `dealValue`,
  `committee`, `quotas`, `oneToOne`, `challenges`, `statements`, puis la 2e série `rdvHistory`,
  `forecast`, `recycling`, `cadence`, `territories`, `weeklyDigest`.
  ⚠️ **`MODULES_V2` = EXCEPTION à la règle « absent = actif »** : ces six-là sont inscrits
  explicitement à `false` sur les environnements EXISTANTS par `migrate` (une fois, via
  `_autoSeed.modulesV2`) — les allumer d'office aurait fait apparaître six onglets du jour au
  lendemain chez des équipes qui ne les avaient pas demandés. Les environnements créés ensuite
  les reçoivent actifs ; la démo les a tous (`modules: defaultEnvModules()` en dur). Le staff coche ce qu'il installe **à la création** de
  l'environnement (App.jsx) et peut y revenir depuis la fiche du projet (`ProjectUsers`).
  ⚠️ **Un module absent du réglage est ACTIF** (`envModuleOn`) : un environnement créé avant ces
  modules ne doit rien perdre. `store.hasModule(id)` répond pour l'env courant (toujours vrai en démo) ;
  un item de `nav.jsx` peut porter `module: '<id>'` — `canSee` (App.jsx) et `ManagerHub` le filtrent.
  Retirer un module masque ses écrans **sans rien effacer**.
- **Nouvelles briques métier** (toutes livrées cette série) :
  - **Passation au closer** (`Handoff.jsx`, onglet, module `handoff`) — `rdv.handoff = {state,to,at,decidedAt,decidedBy,reason}`,
    ouvert par `applyRdvAutomations` au franchissement du jalon. `handoffState/handoffStats/handoffPhases`.
    **Qui close** : manager de l'env (y compris ses propres dossiers) → à défaut le propriétaire →
    à défaut les services/personnes désignés (`env.closers`), voir `store.canClose()`.
    Option `data.primeOnAccept` : ne payer qu'à l'acceptation (désactivée par défaut).
  - **Montant de l'affaire** (module `dealValue`) — `rdv.montant` + `rdv.recurrence` ('oneshot'|'mensuel').
    `dealAnnualValue` ramène tout à une VALEUR ANNUELLE (seule maille comparable entre un contrat
    ponctuel et un abonnement). `pipelineValue` / `wonValue` / `valueBySource`.
    ⚠️ **Sûr à retirer** : le champ est facultatif, chaque helper renvoie 0 sans montant, et aucun
    calcul existant (primes, quotas, entonnoirs) n'en dépend.
  - **Closing** (`Closing.jsx`, onglet, module `closing`) — pipeline AVAL du closer,
    `data.closingPhases` + `data.closingLostReasons`, `rdv.closing = {phase, by, at, wonAt, lostAt, lostReason}`.
    ⚠️ **Axe SÉPARÉ de `rdv.phase`** : fusionner les deux obligerait chaque équipe à faire vivre les
    étapes de l'autre métier et fausserait les entonnoirs existants. Seules l'issue gagnée et l'issue
    perdue sont reportées sur `rdv.phase` par `settleClosing()`, sans quoi une affaire signée par le
    closer resterait invisible dans les primes et les tableaux de bord.
    Une affaire n'entre en closing qu'une fois `handoff.state === 'accepted'` (`inClosing`).
    **Rôle `Closer`** (`CLOSING_ROLE_ID`, rôle d'environnement intégré) : onglets courts (`CLOSER_TABS`)
    et droit `deals.close`. Module retiré → le rôle est supprimé **seulement s'il est resté intact et
    non attribué** : un rôle retouché par le client est un choix, pas un résidu.
  - **Comité d'achat** (module `committee`) — `contact.role` / `contact.relation`, vocabulaire porté par
    l'ENV (`env.committee`, réglé par le staff). `committeeGaps()` alerte au-delà de la qualification.
    HubSpot : propriétés de contact `bdr_role_achat` / `bdr_relation` (jamais des libellés d'association,
    absents de certaines offres de portail).
  - **Objectifs & quotas** (`Quotas.jsx`, onglet ManagerHub, module `quotas`) — `env.quotas`
    {period, metrics, ramp, defaults, byMember}. `memberQuota/rampFactor/quotaAchieved`. Le quota du
    manager REMPLACE la cible auto-fixée sur le Dashboard.
  - **Entretiens 1:1** (module `oneToOne`) — un canal par binôme (`channel.oneToOne`), semé par
    `seedOneToOneChannels` d'après `account.teamOf`. Un changement de manager **archive** l'ancien fil
    (`channel.archived`, renommé « — ancien binôme », rangé en bas) au lieu de le supprimer : l'historique
    des entretiens est ce qui fait la valeur de la brique. ⚠️ Aussi privé qu'un DM : `canSeeChannel` le réserve
    aux deux membres, même pour qui administre les canaux. Compte rendu = message porteur d'un `report`.
  - **Challenges** (`Challenges.jsx`, dans Classement, module `challenges`) — `env.challenges`,
    `challengeScore` (mêmes définitions que les quotas). Bandeau en tête du Dashboard, refermable
    pour la session (sessionStorage) donc rappelé à chaque connexion.
  - **Modulateurs de prime** — `data.primeRules` (seuil / accélérateur / qualité / plafond),
    `applyPrimeRules(total, {data, env, subId, monthKey})`. **Désactivés par défaut**, appliqués au TOTAL
    d'un mois, jamais à une prime isolée ; le détail du calcul s'affiche sur la page Primes.
    ⚠️ **UN SEUL montant de primes dans l'app : le VERSÉ.** `monthlyPaidPrimes(data, env, subId, monthKey)`
    est la source unique — tableau de bord, quota, classement et relevé passent tous par elle. Le brut du
    barème n'est qu'une étape de calcul ; l'afficher à côté du net revient à annoncer deux salaires.
    Seule exception assumée : la **fourchette prévisionnelle** de Pilotage équipe reste au brut (seuil et
    accélérateur dépendent de l'atteinte du quota en FIN de mois, inconnue), et l'écran le dit.
    Les primes d'un **challenge** se comptent à la date de DÉCLENCHEMENT (une fenêtre d'une semaine n'a pas
    de mois de versement) — l'indicateur s'appelle donc « Primes déclenchées », pas « Primes ».
  - **Relevés de primes** (`Statements.jsx`, module `statements`) — `env.statements[subId|monthKey]`.
    ⚠️ **Gelé à la signature** ; retirer la signature efface le document plutôt que d'en changer le contenu.
  - **Objections** + **Modèles de messages** — catégories de « Mes notes » (`Objections.jsx`,
    `MessageTemplates.jsx`), `data.objections` / `data.messageTemplates`, semés une seule fois.
    `fillTemplate` laisse une variable sans valeur VISIBLE entre crochets.
- **Console éditeur** — **`Delivery.jsx`** = onglet **« Projets & atelier »** de `SupportHub`.
  Un projet EST la livraison d'un environnement : les séparer imposait un va-et-vient constant
  (composer dans l'atelier, retrouver le projet ailleurs pour le déployer, revenir ajuster un rôle).
  Deux vues et surtout deux **passerelles** — depuis une livraison, l'atelier s'ouvre SUR son
  environnement (`initialEnvId`) ; à la sortie de l'assistant, on revient sur la livraison née.
  ⚠️ **Fusionner deux écrans n'accorde AUCUN droit** : l'onglet s'ouvre à qui a `projects.view`
  **ou** `env.build` (`perms: [...]` dans `SupportHub`), mais chaque vue reste gardée par le sien,
  et la passerelle n'apparaît qu'avec `env.build`. `npm run audit` fige ces gardes.
  ⚠️ **La ligne de partage** : l'**Atelier** décrit ce que le client REÇOIT (modules, offre,
  rôles & onglets, membres, accès de l'environnement, entrée et déploiement) ; les **Livraisons**
  décrivent OÙ EN EST la mise en place (phases datées, avancement, prise en charge, calendrier,
  motif de clôture). **`EnvAdmin.jsx`** porte le premier — il vivait dans une fenêtre ouverte
  depuis une livraison, donc loin de l'aperçu par rôle qui montre justement l'effet de ce qu'on
  coche. Il prend un `envId`, jamais un projet : la livraison n'était qu'un chemin d'accès.
  L'audit refuse toute seconde copie de ces réglages dans `Projects.jsx` — deux réglages du même
  objet finissent par se contredire. **Exception assumée : la SUPPRESSION** est pilotée depuis le
  panneau des projets (`deleteClientEnv` y est donc autorisé) — un projet est la livraison d'un
  environnement, les deux partent ensemble ; ce qui reste interdit, c'est la CONFIGURATION
  (`setEnvOffer`, `blockEnv`, `ENV_MODULES`).
  **`Workshop.jsx`** (vue « Atelier », perm `env.build`) : assistant en 5 étapes
  (identité & modèle, modules, rôles & onglets, équipe, récapitulatif) + explorateur avec « Voir comme… »
  par rôle/service, sans entrer dans l'environnement (`previewTabs(env, offers, role)` = module ∩ offre ∩ rôle).
  `store.provisionEnvMember()` ouvre un accès chez un client (`addAccount` consomme un siège de l'env COURANT).
  **`StaffAgenda.jsx`** (onglet « Agenda ») : phases de projet, « mon agenda » vs « agenda d'équipe ».
  **Projets** : `takeProject/releaseProject` (+ perm `projects.others`), `deployEnvProject` (Cadrage →
  Implémentation) et phase **Maintenance** posée automatiquement quand un staff entre chez un client.
  **Journal** (`SupportLogs.jsx`) : `logStaff()`/`logStaffNav()`, catégories `STAFF_LOG_CATEGORIES`,
  filtres membre / client impacté / utilisateur impacté / mots-clés / dates / **plage horaire**, export CSV.
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
  regroupe `SupportDashboard`/`Requests`/`Tickets`/`TicketChat`/`Clients`/`Projects`/`KnowledgeBase`/`SupportLogs`/`SupportTrash` + KPI.
  **`SupportDashboard`** (onglet « Tableau de bord », perm `dashboard.view`) : portefeuille client, taux de churn (perdus / engagés),
  raisons de churn agrégées depuis les motifs de clôture des projets, tickets ouverts / sans réponse, délais moyens de 1re réponse et
  de résolution, respect du SLA, CSAT, répartitions par priorité / motif / statut de projet. Kanban Clients : colonne
  **« Clients non aboutis »**. Clôturer un projet **exige** un motif (`closeReason`, `closedAt` posés par `saveProject` ; rouvrir efface
  les deux) — le motif s'affiche sur la fiche client et alimente le dashboard.
  `Support` (client) reste dans « Mes données ». Menu simplifié : 5 catégories (Pilotage, Activité, Mes données,
  Administration, Support Client BD Report).
- **`src/ui.jsx`** — Modal, Confirm (prop `yesLabel`), Field, Select, CommitInput/CommitTextarea (commit au blur = perf),
  toast/Toasts, confetti, DictateButton, etc.
- **`site/`** — site vitrine statique (index.html monofichier i18n FR/EN/ES, `securite.html`, `cgv.html`,
  `confidentialite.html`, `produit/*.html`, `blog/*.html`, `assets/`). **`site/assets/site.css`** porte l'identité
  sombre commune (halos violet/vert, grille fine, cartes en verre, tableaux sobres) : toutes les pages secondaires
  la partagent, seule `index.html` garde son style propre (animations spécifiques). Une teinte ou un espacement se
  change donc à un seul endroit. **Captures** : `npm run shots` (`scripts/screenshots.mjs`) les regénère depuis
  l'app réelle au thème Studio, en passant par la **démo fictive** — jamais par le compte réel, dont le nom
  d'entreprise et d'utilisateur s'afficherait en haut de chaque écran publié.
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
  de rôles + attribution aux comptes. **Menu par rôle** (`ROLE_COLORS`/`roleColor`, `store.setRoleColor/setRoleSuspended`) : couleur de
  repérage (`role.color`, prime sur `ROLE_TINT`), **suspension** (`role.suspended`) et suppression. Un rôle suspendu fait perdre tous
  ses droits staff à ses titulaires (`accountHasPerm` renvoie false) sans modifier sa configuration ; un rôle intégré ne se supprime
  pas (ROLES est en dur) mais se suspend, et le **Fondateur** échappe aux deux (anti-lockout).
  Les onglets de `SupportHub` portent chacun une `perm` (filtrés par `hasPerm`). Les gardes
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
  Staff : Projets → bouton **Utilisateurs** (env) = offre de l'env, **accès de l'environnement entier**
  (désactiver/réactiver via `blockEnv`/`unblockEnv`, supprimer via `deleteClientEnv`) puis, par membre : rôle manager,
  désactiver l'accès (`account.disabled`, login refusé), voir/changer mot de passe, effacer les données, retirer.
  Ces deux gestes sur l'environnement **ont quitté la fiche Clients** (qui n'affiche plus que l'état et y renvoie) :
  toute l'administration d'un client tient au même endroit plutôt qu'à deux.
  Manager (Gestion Administration mode `teams`) : périmètre strict (son équipe, jamais le staff).
- Catégorie menu **« Support Client BD Report »** réservée à `SUPPORT_ROLES`. Onglet **Support** ouvert à tous.
- Tickets : priorité, assignation, SLA (1re réponse cible par priorité), CSAT à la clôture. Réponses types + base de connaissances.
- **Résiliation** (Paramètres → Gérer mes environnements → Résilier) : ouvre un ticket + passe l'env en `subState='cancelling'`
  → **lecture seule** (`readOnly`), briques transparentes, seul le Support éditable. Le support peut bloquer/débloquer/supprimer
  un env client depuis la fiche Clients (`subState` 'blocked'/'active').

## Intégration HubSpot
- **`src/hubspot.js`** — client API complet (CRM v3/v4) : `crm` (list/get/create/update/archive/search/
  batch{Read,Create,Update,Upsert,Archive}/merge/gdprDelete/findByProperty/listAll), `associations` (v4,
  default + typées + batch + labels), `properties`, `pipelines`, `owners`, `meetings/calls/notes/tasks/emails`,
  `lists`, `forms` (seule API CORS-friendly), `timeline`, `webhooks`, `imports`, `account`, `oauth`.
  Cœur `hsRequest` : auth, erreurs normalisées (`HubspotError`), reprise sur 429/5xx (`Retry-After`), journal
  (`hubspotCallLog` + événement `hubspot-log`). `HS_ENDPOINTS` = catalogue exécutable (explorateur d'API).
  ⚠️ **CORS** : api.hubapi.com refuse les appels navigateur → passer par un **relais** (`base` = URL du relais).
- **`src/hubspotSync.js`** — correspondance BD Report ↔ HubSpot : entreprise→company, contacts→contact (clé
  `email`), RDV→deal (clé `bdr_rdv_id`) + meeting + note, tâches→task ; `DEFAULT_STAGE_MAP` (R1/R2/MQL/SQL/
  Signée/KO → étapes), `ensureCustomProperties()` (crée les champs `bdr_*`, idempotent), `pushRdv/pushContact/
  pushAll` (progression + tolérance aux erreurs), `pullContacts/pullDeals`, `loadPipelines`. Envois **idempotents**
  (upsert par clé) + associations posées automatiquement.
- **`src/pages/Hubspot.jsx`** — console « Intégration HubSpot » (nav Administration, brick homonyme) : connexion
  **par entreprise** (« Connecter mon HubSpot » → fenêtre OAuth, portail relié affiché, Tester/Déconnecter,
  + « réglages avancés » repliés : mode, URL du connecteur, jetons de repli), préparation du portail (créer les
  propriétés, charger pipelines/propriétaires, mapper les phases), synchronisation (tout envoyer / RDV / contacts /
  importer), explorateur d'API, journal des appels. Exporte **`HubspotPushButton`** (bouton par enregistrement,
  utilisé dans la fiche RDV).
- 🔑 **Une connexion HubSpot PAR ENTREPRISE CLIENTE** (= par environnement). Trois modes (`HUBSPOT_MODES`) :
  `oauth` (défaut : le client relie SON portail en un clic), `proxy` (jeton unique de l'éditeur), `direct`
  (api.hubapi.com + jeton local, avancé). Config **éditeur** = `db.integrations.hubspot` (surtout `proxyUrl` =
  URL du connecteur, publiée à tous) ; config **client** = `env.hubspot` (portail relié, `tenantKey`, stageMap,
  options) ; `effectiveHubspotConfig(platform, envCfg, envId)` fusionne les deux. **Aucun jeton HubSpot dans
  l'état synchronisé** : ils vivent chez le connecteur, indexés par entreprise ; l'app n'envoie que les en-têtes
  `X-BDR-Tenant` (id d'env) + `X-BDR-Key` (`env.hubspot.tenantKey`). Seul le mode `direct` garde un jeton en
  localStorage (`bdrflow_hubspot_token_v1`).
- **Store** : `store.hubspot()` (config effective de l'entreprise courante), `hubspotPlatform()/
  setHubspotPlatformConfig` (éditeur, support uniquement), `setHubspotConfig` (écrit dans `env.hubspot`),
  `connectHubspotPortal/disconnectHubspotPortal`, `hubspotToken/setHubspotToken`, `setRdvHubspotIds/
  setContactHubspotId`. Effet `applyHubspotConfig` + envoi automatique optionnel (`autoPush`, signature ignorant
  le champ `hubspot` → pas de boucle, rien n'est envoyé à la 1re passe).
- **`src/hubspot.js`** côté connexion : `connect` (`startUrl/status/saveToken/disconnect`), `openHubspotConnect()`
  (fenêtre OAuth + `postMessage` du connecteur, vérifie l'origine), `newTenantKey()`.
- **Côté éditeur (à faire une fois)** : `hubspot/SETUP.md` (application HubSpot + scopes, déploiement du
  connecteur, publication de son URL dans l'app) + `hubspot/proxy-worker.js` (**connecteur multi-clients**
  Cloudflare Worker : CORS, `/oauth/start`, `/oauth/callback`, `/tenant/status|token|disconnect`, relais API,
  jetons par entreprise en KV `TENANTS`, refresh auto, état OAuth signé HMAC) + `hubspot/wrangler.toml`.
- **Côté client** : mode d'emploi publié dans la base de connaissances (`KB_HUBSPOT_ARTICLE`, id
  `kb-hubspot-connect`, semé une fois via `db._autoSeed.kbHubspot`) → visible dans l'onglet Support.

## Supabase (synchro temps réel cross-device, optionnelle)
- Config : **`src/supabaseConfig.js`** (URL + clé anon) ; côté site : bloc `window.BDR_SUPABASE_*` dans `site/index.html`.
  Vide = 100 % local (inerte). **Clés obscurcies** (XOR+base64 via `src/obf.js` / `bdrDeob` côté site) : plus aucune clé
  en clair dans le repo ni le build (anti-scan). Pour changer une clé : régénérer la valeur obfusquée (XOR pad `bdreport-obf-2026-v1`).
  ⚠️ Obscurcissement ≠ secret (app front, clé reconstruite au client) : vraie confidentialité = RLS.
  Le même `deob()` masque aussi les **informations internes** du bundle livré : nom de l'environnement semé,
  identité du compte '01', pipeline commercial réel de `seedPipelineRdvs()` (noms d'entreprises et de contacts
  identifiables) et URLs de release. **Masquage de façade uniquement** : aucun accès n'est modifié et les valeurs
  sont reconstruites côté client. Vérification : après `npm run build`, aucune de ces chaînes ne doit apparaître
  dans `dist/assets/*.js`.
- Schéma SQL + guide : **`supabase/schema.sql`** et **`supabase/SETUP.md`**. Tables : `app_state` (tout l'état en JSONB,
  realtime, dernier-écrit-gagne, anti-écho par `_client`) et `contact_requests`.
- Logique : `src/supabaseSync.js` + effet dans `StoreProvider`. Au 1er chargement, **le distant fait foi s'il existe**.
  Bouton de test : Paramètres → Intégrations → « Tester la connexion ».
- 🔒 **Blob chiffré au repos** : `src/blobCrypto.js` (AES-256-GCM) chiffre l'état avant push Supabase et le déchiffre
  à la lecture/realtime (rétro-compatible avec l'ancien clair). Neutralise le pillage auto de la table via la clé anon.
  Limite : app 100 % front ⇒ clé livrée au client (protège du scan opportuniste, pas d'un attaquant ciblé). Vrai
  correctif = RLS par org (`supabase/schema_multitenant.sql` + `MIGRATION_MULTITENANT.md`, derrière `FEATURES.multiTenant`).
- 🔒 **Sécurité — mots de passe : PLUS AUCUN CLAIR, nulle part.** `account.password` est un hash
  `sha256:…` et rien d'autre. `passwordClear`/`passwordPlain` sont **purgés par `migrate`** et ne
  sont plus jamais écrits (création client, création staff, réinitialisation, migration d'un
  format hérité). Le droit `passwords.view` a été **retiré du catalogue** : un droit qui ne fait
  rien laisse croire qu'il protège quelque chose. Reste `passwords.reset`.
  **Contrepartie, exigée et vérifiée** : le manager conserve l'accès à l'ESPACE de ses
  collaborateurs (`team.view`/`team.manage`) — cet accès n'a jamais eu besoin de leur mot de
  passe, et confondre les deux est ce qui justifiait de garder un clair. `npm run audit` fige
  les deux garanties.
- 🔒 **Écrasement entre collègues — corrigé.** L'arrivée d'un état distant ne REMPLACE plus
  l'état local : `mergeRemoteDb(local, remote)` garde, espace par espace, la version au `_rev`
  le plus récent (`_rev` posé par `writeSubData` à chaque écriture). Sans cela, la copie périmée
  qu'un collègue portait de votre espace effaçait votre travail en cours. Ce n'est pas de la
  fusion de contenu : deux personnes sur le MÊME espace se départagent toujours à la plus récente.
- ⛔ **RESTE À FAIRE avant une prod publique — voir `supabase/RUNBOOK_SECURITE.md`.**
  La RLS de `app_state` est `using(true)` : la clé anon (publique par construction) permet de
  lire/écrire tout le blob, tous clients confondus. Le schéma cible, la RLS par org, le script de
  migration, l'auth Supabase et la synchro par org sont **écrits et vérifiés** (l'invariant de
  découpage tourne à chaque `npm run audit`), mais **`store.jsx` n'est pas branché dessus** : le
  drapeau `FEATURES.multiTenant` est donc inerte. Le runbook dit précisément ce qui reste, et
  pourquoi le branchement ne doit pas se faire avant d'avoir un projet Supabase de test.

## DÉPLOIEMENT — IMPORTANT
Le **proxy git de l'environnement de dev bloque la branche `gh-pages`** (seul le push de la branche de travail passe).
→ Le déploiement se fait donc **via GitHub Actions**, pas par push git local.
- **`.github/workflows/deploy-pages.yml`** : build l'app, inline en un seul fichier, assemble site (racine) + app (`/app`),
  publie sur `gh-pages` (peaceiris, `force_orphan`). **Se déclenche à chaque push** sur `claude/adoring-tesla-t0fwpc`,
  ou à la main (onglet Actions → « Run workflow »). Le workflow existe aussi sur `main` (requis pour le dispatch manuel).
- **`.github/workflows/desktop-release.yml`** : build l'app de bureau **Tauri** (Windows/macOS/Linux) et publie une release
  GitHub (tag `desktop-latest`). Déclencheur : tag `v*` ou manuel. ⚠️ Tauri : `src-tauri/Cargo.toml` désactive la feature
  `compression` de Tauri (`default-features=false, features=["wry"]`) pour éviter le crate `brotli` cassé.
- ⚠️ **Pas d'`import()` dynamique vers un module local** : le workflow inline l'app en un seul fichier et ne
  publie que lui, donc tout morceau séparé produit par Vite finit en 404 (« Failed to fetch dynamically imported
  module »). Utiliser des imports statiques ; l'exception est l'import d'une **URL externe** (esm.sh), qui ne
  produit pas de morceau local.
- App live : `owenmtp1.github.io/Claude/app/` (ou `/BD-Report/app/`). Site : la racine.
  Domaine perso **`bdreport.js.org`** (js.org, gratuit) : fichier `CNAME` généré par le workflow ; une fois la
  PR js.org fusionnée, le site sert à la racine du domaine. Toutes les URLs SEO (canonical/OG/sitemap) pointent dessus.
- Déclencher/suivre via les outils GitHub MCP (`actions_run_trigger`, `actions_list`, `get_job_logs`).

## Conventions
- Travailler/commiter sur la branche **`claude/adoring-tesla-t0fwpc`** (le push y est autorisé).
- Finir chaque lot par `npm run build` + `npm run smoke` + `npm run audit` (doivent être verts).
- ⚠️ **`this.` DEVANT TOUT APPEL À UNE MÉTHODE DU STORE.** Les méthodes vivent dans un objet
  littéral : `setSub(...)` sans `this.` ne désigne rien et lève une `ReferenceError` **au clic**
  — le bouton « ne fait rien », sans message ni trace, et aucun test de rendu ne peut le voir.
  Trois méthodes en ont souffert (`setEcosystem`, `renamePhase`, `importEnvContacts`) : activer
  les seuils et plafonds était sans effet. `npm run audit` refuse désormais tout appel nu.
- ⚠️ **Tous les hooks React AVANT le moindre `return` conditionnel** : un espace qui se charge en
  différé ferait sinon varier l'ordre des hooks d'un rendu à l'autre (bug corrigé sur Handoff,
  Objections et MessageTemplates).
- Messages de commit en français, terminer par la ligne de session https://claude.ai/code/session_01TQYeMHDBAhMgz1SYCBwizb
- Ne pas mettre l'identifiant de modèle dans le code/commits.

## Pistes restantes (proposées, non faites)
Backend/auth Supabase durci + RLS par locataire ; notifications e-mail ; centre de notifs unifié ; import calendrier ;
signature de code desktop (Apple/Windows) ; mettre à jour `OwenMtp1/Claude` → `OwenMtp1/BD-Report` dans les liens si besoin.
