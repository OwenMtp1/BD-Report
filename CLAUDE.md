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
  - **Fermer un projet FERME L'ACCÈS, et ouvre une discussion.** `makeClosureTicket` crée un ticket
    `PROJECT_CLOSURE_CATEGORY` (« Fermeture de projet ») adressé au **propriétaire côté client**
    (`env.createdBy` s'il est client, sinon le Manager, sinon le premier membre ; sans compte client, personne).
    ⚠️ **Le client ne voit JAMAIS qui a fermé, ni le motif interne** : le message dit que l'accès a été fermé
    « par l'équipe BD Report » et à quoi sert la discussion. L'auteur et le motif vivent dans
    `ticket.projectClosure` (lu par la seule console support), le journal staff et l'entrée de corbeille.
    ⚠️ Le message est `from: 'support'`, **pas `'bot'`** : `TicketChat` masque les messages bot dès la première
    réponse d'un technicien, et le contexte de la fermeture disparaîtrait avec eux.
    Tous les comptes CLIENTS de l'environnement sont **désactivés** — sauf ceux qui ont encore un autre
    environnement (`hasAnotherEnv`), et sauf le propriétaire, qui porte `account.closureTicketId` : il peut
    encore se connecter, mais `App.jsx` ne lui ouvre QUE `ProjectClosed.jsx` (la discussion), avant tout choix
    d'environnement. Sans lui, la décision se prendrait entre BD Report et un mur.
    ⚠️ **La clôture de ce ticket EST la décision**, et il n'y a que deux issues (`ClosureDecision` dans
    `Tickets.jsx`, droit `projects.manage`) : **rétablir** (`restoreClosedProject` → `restoreDelivery` rend tout
    et rend les accès) ou **supprimer définitivement** (`purgeClosedProject` → `purgeDelivery` purge l'archive
    ET supprime les comptes qui ne vivaient que là ; le ticket, lui, survit comme trace). Ni le client
    (`Support.jsx`) ni le support ne peuvent refermer le fil sans trancher — sinon une équipe resterait
    désactivée sans que personne ne l'ait décidé. `emptySupportTrash` passe par le même chemin.
    ⚠️ Application 100 % front : « invisible du client » est une garantie d'INTERFACE, pas de confidentialité —
    tout l'état vit dans le navigateur (même limite que le reste, cf. RLS).
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
  **`EnvPicker`** liste `store.selectableEnvs()` — jamais sa propre règle. ⚠️ Il tranchait sur `account.developer`,
  un drapeau que seul le compte d'origine ('01') porte : tout autre compte **Fondateur ou Support** voyait les
  environnements clients partout (fiche client, livraisons, atelier, « voir en situation ») et n'en trouvait
  **aucun** au moment d'entrer.
  🔑 **`env.access` — « Entrer dans tous les environnements clients » est une PERMISSION staff**, pas une
  déduction de rôle. `store.canEnterClientEnvs()` (= `accountHasPerm(account,'env.access')`) commande TOUT le
  chemin : `selectableEnvs` (la liste), `skipsPin` (l'exemption de code), `enterEnv` +
  `markProjectMaintenance`/`endProjectMaintenance` (la trace laissée en entrant). Accorder l'accès en laissant
  une porte verrouillée derrière n'accorderait rien ; `npm run audit` fige les cinq points.
  Défaut : Fondateur (tous droits) et Support BD Report ; **pas** Administrateur — composer un environnement
  (`env.build`) et entrer chez le client sont deux gestes différents. ⚠️ Rattrapage `_autoSeed.envAccessPerm` :
  les rôles déjà enregistrés ne contiennent pas ce nouvel id, une base en service aurait vu son équipe support
  perdre l'accès du jour au lendemain. Posé UNE FOIS sur les rôles de `SUPPORT_ROLES` — donc le retirer ensuite
  est un choix, jamais un oubli que la migration corrigerait.
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
  - **Signaux d'une entreprise** — action **📡 Signaux** DANS la fiche entreprise (`Company.jsx`,
    `SignalsPanel`). Aucune page ni onglet de navigation ajoutés — c'est une action de fiche, et
    `npm run audit` le fige.
    ⚠️ **« Actualités » A FUSIONNÉ ICI, il n'existe plus.** C'était la même fonctionnalité arrêtée à
    mi-chemin : elle ramenait des dépêches qu'il fallait faire analyser d'un SECOND clic. Personne ne
    veut une liste de dépêches — on veut savoir s'il y a une raison d'appeler ce compte. **Un seul
    geste** va donc de la collecte jusqu'à l'analyse, et c'est le RÉSULTAT DE L'IA qui s'affiche.
    ⚠️ **Les sources ne s'étalent plus : elles se DÉPLIENT** (« Sources (n) »). Un signal sans ses
    preuves est une affirmation — elles restent atteignables — mais elles noyaient l'analyse qu'elles
    servent à vérifier. Le dépliant montre aussi ce que CHAQUE source a donné, et pourquoi elle n'a
    rien donné : « rien trouvé » et « pas de site renseigné » ne se corrigent pas de la même façon.
    ⚠️ **UNE SEULE ANALYSE dans le relais** — celle des signaux, contextualisée par `env.newsRules`.
    L'analyse « actualités » avait son propre prompt, sans le contexte de l'équipe : elle jugeait
    l'intérêt commercial d'un fait sans savoir ce que l'équipe vend. Deux prompts pour une même
    question, c'est aussi deux endroits à corriger — et c'est ainsi que l'un a fini par appeler un
    `PROMPT` supprimé (« PROMPT is not defined » à l'écran). `/analyze` reste servie pour un
    navigateur qui exécute encore une version en cache, mais passe par l'analyse unique.
    ⚠️ **Tout passe par un RELAIS** (`news/worker.js`, Cloudflare Worker, `news/SETUP.md`), comme HubSpot,
    et pour deux raisons également dirimantes dans une app 100 % front : le flux RSS de Google News n'a
    aucun en-tête CORS, et une **clé Gemini dans le bundle serait publique** donc facturable par n'importe
    quel visiteur. L'application ne connaît qu'une URL (`db.integrations.news.relayUrl`, publiée par le
    staff dans Paramètres → Intégrations, `store.newsRelay/setNewsRelay/testNewsRelay`).
    ⚠️ **L'IA ne part JAMAIS toute seule** : elle coûte un appel et une attente. Le relais borne ce qu'elle
    renvoie (scores 0-100, 5 signaux max) et **résout les preuves citées sur les nôtres** — un signal sans
    preuve, ou dont la preuve est inventée, n'a aucun chemin vers l'écran. Cache 24 h en `localStorage`
    (`src/signals.js`), volontairement hors de l'état synchronisé : des dépêches sont une vue, pas une donnée
    d'équipe, et les y écrire déclencherait une synchro à chaque ouverture de fiche.
    Sans relais publié, le panneau le dit et rien d'autre ne change.
    ⚠️ **RIEN NE PART AU MONTAGE — pas même la collecte, pourtant gratuite.** Le panneau lançait sa
    recherche dans un `useEffect`, et il se remonte (mode strict de React, et la fiche entreprise se
    remonte quand l'URL partageable change) : chaque remontage valait un appel. C'est cela qui faisait
    atteindre le quota gratuit en quelques clics — pas le volume. S'y ajoute le partage des demandes
    déjà en vol (`src/aiGuard.js`) et le respect du délai annoncé par Google. Le smoke ouvre le panneau
    et exige ZÉRO appel, puis compte un appel de chaque sorte par clic ; `npm run audit` refuse tout
    `useEffect` qui collecte.
    ⚠️ **Quota (429) : ROTATION DE MODÈLES.** Chaque modèle a son propre compteur —
    `GEMINI_MODELS` est essayé dans l'ordre, et le 429 d'un modèle fait passer au suivant.
    Le modèle qui a RÉELLEMENT répondu est celui qu'on enregistre dans le compteur.
    ⚠️ **MAIS TOUTES LES LIMITES NE SONT PAS PAR MODÈLE**, et c'est ce qui bloquait
    l'enrichissement. Celle de la **recherche Google** (le « grounding ») est COMMUNE à tous
    les modèles et bien plus serrée que celle du texte : les essayer l'un après l'autre ne
    faisait que collectionner trois fois le même refus, et l'écran annonçait « sur tous les
    modèles » pour un plafond situé ailleurs. `quotaMetricOf`/`isGroundingQuota` lisent la
    limite que Google nomme dans l'erreur ; la rotation s'arrête, et le message la désigne.
    ⚠️ **L'IA EST DEVENUE FACULTATIVE, ET C'EST TOUT LE CORRECTIF.** Deux sources publiques
    tournent EN PARALLÈLE avant elle, gratuites, sans clé et sans quota : l'**annuaire des
    entreprises** (implantation, effectif, secteur — officiel, donc prioritaire) et
    **Wikidata** (site, LinkedIn, chiffre d'affaires — base CC0 faite pour être interrogée).
    À elles deux elles couvrent les six champs : Gemini n'est appelé que pour ce qui reste,
    et un refus total ne fait PLUS échouer l'enrichissement — on rend ce qu'on a et on dit ce
    qui a manqué (`registryError`, `wikiError`, `aiError`, `source`).
    ⚠️ **L'homonymie est le vrai danger de Wikidata** : « Orange » est aussi un fruit. Une
    entité n'est retenue que si son nom correspond ET que sa description désigne une
    organisation (`WD_ORG`) — remplir la fiche d'un client avec les données d'autre chose est
    pire que ne rien trouver. Wikidata reste en confiance « medium » : une base collaborative
    ne vaut pas une source d'État.
    ⚠️ **TROIS DES SIX CHAMPS N'ONT JAMAIS EU BESOIN D'UNE IA.** L'implantation, l'effectif
    et le secteur d'une société française sont publiés par l'État — **annuaire des entreprises**
    (`recherche-entreprises.api.gouv.fr`), gratuit, sans clé, sans quota. Les faire chercher par
    un modèle dépensait le quota le PLUS SERRÉ du produit pour une réponse moins sûre qu'une
    donnée officielle. `officialRegistry()` tourne donc EN PREMIER, et **l'IA ne traite que ce
    qui reste** (`remaining`) : si l'annuaire couvre tout, aucun appel Gemini n'est fait.
    Le code INSEE de tranche d'effectif est traduit en ordre de grandeur (`INSEE_TRANCHES`) —
    afficher « 42 » là où on attend une taille n'apprend rien. ⚠️ **Ce que l'annuaire a trouvé
    est ACQUIS** : un refus de Gemini ne l'efface plus (`keep()`), on rend ce qu'on a et on dit
    ce qui a manqué (`registryError`, `aiError`, `source`).
    ⚠️ **Le quota de recherche n'arrête plus l'enrichissement** : le relais repasse par NOS
    propres pages (`ownSources` = site de l'entreprise + presse, les collecteurs des signaux)
    et rappelle Gemini SANS outil, avec ces pages pour seule matière. Jamais depuis la
    mémoire du modèle — un enrichissement sans source est une invention, et `fallback`
    interdit toute URL absente des pages fournies. Sans rien à lire, le quota reste la
    bonne réponse. `found.fallback` remonte à l'écran : la couverture est plus étroite
    (un site donne rarement le chiffre d'affaires), et cela doit s'expliquer autrement
    que par « l'IA n'a rien trouvé ».
    🔎 **`/diag` — LE RELAIS SE TESTE LUI-MÊME**, et `store.diagNewsRelay()` l'affiche dans
    Paramètres → Intégrations (« Diagnostic complet »). Une panne d'enrichissement a trois
    causes qui ne se corrigent PAS de la même façon — clé absente, quota de texte, quota de
    RECHERCHE — et tant qu'on les devinait depuis un message d'erreur, on cherchait au mauvais
    endroit. La route interroge les cinq briques POUR DE VRAI (clé, annuaire, presse, Gemini
    texte, Gemini recherche) et rend un **verdict écrit**, pas un état à interpréter.
    ⚠️ Aucun secret n'en sort : on dit si la clé existe, jamais ce qu'elle vaut — le test le fige.
    ⚠️ **Un compteur d'attente PAR FONCTIONNALITÉ** (`aiGuard.cooldownLeft(scope)`). Avec une
    clé commune, un enrichissement refusé mettait AUSSI les signaux au repos — alors que
    leur quota était intact, puisque ce n'est pas le même.
    ⚠️ **Modèle Gemini retiré (404)** : Google nomme son successeur dans le message d'erreur — le relais
    le lit et rejoue l'appel UNE fois (`callGemini`). Il n'invente jamais de remplaçant. Défaut :
    `gemini-3.6-flash`. ⚠️ **Quota Google (429)** : ce n'est ni une panne ni notre plafond. Le relais
    renvoie le délai d'attente que Google indique, et l'application **ne décompte pas** cet appel —
    il n'a rien consommé.
  - **Enrichissement de fiche** — action **✨ Enrichir**, même panneau, même relais (`POST /enrich`,
    Gemini avec recherche Google : sans source, le modèle répondrait de mémoire, c'est-à-dire
    qu'il inventerait). `src/enrich.js`.
    ⚠️ **AUCUN CHAMP N'EST CRÉÉ.** `ENRICHABLE` décrit EXACTEMENT les quatre champs de la fiche
    (`data.companies[nom]` : `site`, `linkedin`, `localisation`, `ca`, `effectif`, `secteur`) ; l'application envoie cette
    liste et le relais **itère dessus**, jamais sur la réponse du modèle. `npm run audit` compare
    `ENRICHABLE` aux `setInfo(...)` de `Company.jsx` : un écart, et le test tombe. `effectif` et `secteur`
    ont quitté le RDV pour la FICHE : lus sur le dernier rendez-vous, deux commerciaux voyaient
    deux valeurs pour la même société sans pouvoir corriger la fausse. La valeur du RDV reste le
    point de départ tant que personne n'a saisi la sienne.
    ⚠️ **L'ENTREPRISE, JAMAIS LES PERSONNES**, même quand la fiche affiche des contacts. Le relais
    refuse toute valeur qui ressemble à une donnée personnelle.
    ⚠️ **Rien n'est écrasé sans décision** : champ vide → proposé coché ; valeur différente →
    montrée EN REGARD de l'actuelle, décochée. Sans source vérifiable, la confiance retombe à « low ».
  - **ICP — DEUX PÉRIMÈTRES, et dans chacun deux profils.** Bascule en tête de page, même
    mécanique que le pipeline de `Leads` : **« Mon ICP »** (mes affaires) et **« ICP de
    l'entreprise »** (tous les comptes de tous les espaces de l'environnement). ⚠️ Un seul
    portefeuille n'a presque jamais assez de signatures pour qu'un taux veuille dire quelque
    chose ; l'équipe, si — ne montrer que le premier, c'était conclure sur dix affaires.
    En vue équipe : `deals` ET `companies` sont AGRÉGÉS (une fiche remplie par un collègue
    vaut pour tout le monde, sinon le compte serait classé « secteur inconnu »), chaque deal
    porte son `_owner`, et les profils des collègues s'affichent avec leur auteur — un
    enseignement anonyme ne se vérifie pas.
    ⚠️ **On n'écrit JAMAIS chez un collègue** : `_mine` commande la suppression et la
    séparation ; enregistrer une proposition depuis la vue équipe la range dans SON espace.
    ⚠️ Le **pipeline de référence reste celui de mon espace** (`ref = sub`) : les phases, la
    qualification et le jalon sont un vocabulaire d'environnement, pas une donnée de deal.
    `companies` est donc passé À PART de `data` aux cartes.
  - **ICP — DEUX profils dans chaque périmètre, parce qu'il y a DEUX QUESTIONS** (`ICP_KINDS`) :
    **ICP entreprise** (`kind:'company'` — `secteurs[]`, `effMin/effMax`, `localisations[]`) répond
    à « quel compte vaut mon temps ? » ; **ICP personnel** (`kind:'person'` — `postes[]`, `roles[]`,
    `relations[]`, ces deux derniers venant du module `committee`) répond à « à qui parler dedans ? ».
    ⚠️ Confondus dans un profil unique, la bonne entreprise abordée par le mauvais interlocuteur se
    lisait « hors profil » : le commercial lâchait le compte au lieu de changer de porte.
    `icpVerdict` renvoie donc `{company, person}` et `Rdv.jsx` affiche **deux avis**.
    ⚠️ **La FICHE entreprise prime sur le RDV** (`companyTraits`) pour secteur, effectif et
    implantation — même règle que l'enrichissement : la valeur du RDV n'est qu'un point de départ.
    ⚠️ **Un profil sans `kind` est ANTÉRIEUR à la séparation** : `icpKindOf` le déduit et le rend
    `'mixed'` s'il porte les deux natures — il continue alors de filtrer sur tout et répond aux deux
    questions. **Aucune migration ne le réécrit** : ses deux moitiés sélectionneraient chacune plus
    large que l'ensemble qu'elles remplacent, et le pipeline aurait changé sans un mot. Le bouton
    « Séparer » est un choix de l'utilisateur, jamais un geste de `migrate`.
    ⚠️ Les valeurs proposées par l'éditeur viennent des DONNÉES (secteurs et implantations vus,
    postes rencontrés, vocabulaire du comité), jamais d'une liste inventée : un critère qu'aucun
    deal ne porte ne sélectionnerait rien, sans qu'on sache pourquoi.
  - **Sales Signals — LOT 1 : le contexte commercial de l'environnement.** `env.newsRules`
    (`activite`, `offre`, `icpProfileIds[]`, `personas[]`, `signals[{id,on,priority}]`, `consignes`,
    `sources{}`), réglé dans `NewsRules.jsx` — **étape de l'assistant ET panneau de la fiche**
    d'environnement : une règle qu'on ne pourrait fixer qu'à la livraison serait fausse au bout
    d'un trimestre. `store.envNewsRules/saveEnvNewsRules/canEditNewsRules` (droit `env.build`).
    ⚠️ **L'ICP N'EST PAS RECOPIÉ** : `icpProfileIds` RÉFÉRENCE les profils existants
    (`data.icpProfiles`, agrégés par `store.envIcpProfiles`). Deux définitions du même client
    finiraient par diverger sans que personne ne sache laquelle fait foi.
    `SIGNAL_TYPES` (16), `SIGNAL_PRIORITIES` (la priorité PÈSE dans le score — sans elle tous les
    signaux se vaudraient), `SIGNAL_SOURCES` (publiques : presse, site, page carrière — aucune clé,
    aucun compte), `SOURCE_QUALITY`, et `signalScore()` qui n'est PAS une moyenne : importance,
    pertinence, confiance, fraîcheur, corroboration entre sources indépendantes, priorité du staff.
    ⚠️ `saveEnvNewsRules` repart du CATALOGUE : un type retiré du code ne survit pas dans un
    réglage, un type ajouté apparaît éteint plutôt que de manquer.
  - **Sales Signals — LOTS 2-5 : le moteur.** Chaîne : COLLECTE (gratuite) → REGROUPEMENT →
    ANALYSE IA CONTEXTUALISÉE → SCORE → SIGNAL. Relais : `/signals/collect` (trois collecteurs
    PUBLICS, sans clé ni compte — presse avec requêtes composées à partir des signaux cochés,
    site de l'entreprise, page carrière) et `/signals/analyze`. App : `src/signals.js`,
    `data.signals` par espace, `store.saveCompanySignals/setSignalStatus`.
    ⚠️ **UN SIGNAL N'EST PAS UN ARTICLE.** Un SEUL appel IA couvre toute l'entreprise : c'est
    ce qui permet de rassembler « 8 offres + un DRH nommé + un bureau ouvert » en UN signal de
    structuration, et ce qui rend le coût tenable. Le relais RÉSOUT les preuves citées sur les
    nôtres et refuse tout signal sans preuve — une source inventée n'a aucun chemin vers l'écran.
    ⚠️ **Collecte et analyse sont DEUX TEMPS.** Ramasser ne coûte rien ; seule l'analyse consomme,
    et elle ne part jamais seule — ni à l'ouverture d'un écran, ni sur des preuves inchangées
    (`evidencePrint` le dit sans demander à l'IA).
    ⚠️ **`signalScore` N'EST PAS UNE MOYENNE** : importance, pertinence avec l'offre, confiance,
    fraîcheur, corroboration entre sources INDÉPENDANTES (la même source deux fois n'en est pas
    une), qualité de la meilleure source, priorité du staff, confiance du rattachement. Il est
    RECALCULÉ à l'affichage — un score figé vieillirait en silence.
    ⚠️ **robots.txt est consulté** avant de lire une page, et son absence vaut autorisation.
    Aucun contournement de CAPTCHA, d'authentification ou de paywall.
    UI : onglet **Signaux** (`Signals.jsx`, résumé + filtres + balayage explicite) → « Analyse
    détaillée… » ouvre la fiche entreprise sur sa vue Signaux (événement `company-view`), là où
    vivent les preuves. Un statut posé sur un signal SURVIT à une nouvelle analyse, sinon plus
    personne ne cocherait rien.
  - **Brique `aiInsights`** (`MODULES_V3`) — les DEUX actions relèvent d'une seule case à cocher :
    même relais, même clé, même compteur. Deux cases auraient donné deux réglages pour une seule
    décision (« met-on de l'IA chez ce client ? »). Éteinte chez l'existant, comme `MODULES_V2`.
  - **Compteur Gemini** — `db.aiUsage` (appels RÉELS uniquement : le cache ne consomme rien),
    `AI_FEATURES` = `news_analysis` / `company_enrichment`, onglet **« Utilisation IA »** de
    `SupportHub` (`AiUsage.jsx`, perm `stats.view`), réglage du plafond par la permission `ai.manage`.
    ⚠️ `AI_DEFAULT_DAILY_LIMIT` (500) est une **sécurité INTERNE**, pas le quota de Google : l'API ne
    le publie pas, prétendre le refléter serait afficher un chiffre inventé. Paliers 70/85/95 %, blocage
    à 100 % — et **les actualités restent consultables sans IA** : une limite qui n'est pas celle de
    l'utilisateur ne doit pas lui retirer ce qui ne coûte rien.
  - **Entretiens 1:1** (module `oneToOne`) — un canal par binôme (`channel.oneToOne`), semé par
    `seedOneToOneChannels` d'après `account.teamOf`.
    **Trame composée par le manager** : `env.oneToOneTemplate = [{id,label,type,hint}]`
    (`ONE_TO_ONE_FIELD_TYPES` : ligne, texte libre, note sur 5, case à cocher),
    `store.oneToOneTemplate/saveOneToOneTemplate/canEditOneToOneTemplate` (droit `team.manage`).
    Ses rubriques s'AJOUTENT aux trois blocs communs et sont redemandées à chaque entretien —
    c'est ce qui rend deux comptes rendus comparables d'un mois sur l'autre. Portée par
    l'ENVIRONNEMENT : une trame que chacun verrait autrement n'en est pas une. ⚠️ Le compte rendu
    fige le LIBELLÉ avec la valeur (`report.fields`) : renommer la trame ne réécrit pas le passé. Un changement de manager **archive** l'ancien fil
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
- ⚠️ **Une demande CLOSE quitte le tableau Clients.** La carte née d'une demande du site
  (`client.key = 'req:<id>'`) suit son sort : traitée ou archivée, `syncClientFromRequest` la
  RANGE (`client.archived`) — elle n'est jamais supprimée, et un interrupteur la rend. Sans cela
  le tableau cessait de dire ce qu'il reste à faire pour ne raconter que ce qui est arrivé un jour.
- **Cycle de vie d'un client sur le kanban.** `CLIENT_STATUSES` porte une colonne
  **« En cours de churn »** : entre « il part » et « il est parti » il y a un moment qui dure —
  l'accès est fermé, le ticket de fermeture est ouvert, rien n'est décidé. `archiveDelivery`
  y place le client ; `restoreDelivery` lui rend son statut d'avant ; `purgeDelivery` **le
  retire du tableau** (garder un « ancien client » effacé fausserait le portefeuille et le taux
  de churn). Une archive qui EXPIRE sans décision le passe en « anciens » — expirer n'est pas
  décider. ⚠️ `CLIENT_FINAL_STATUSES` : un client en churn ou ancien ne redevient pas « actif »
  parce qu'il a écrit au support — son statut vient de son environnement, pas d'un ticket.
- **`src/pages/Companies.jsx` — onglet « Mes entreprises »** (brick homonyme, nav Activité) : toutes les
  sociétés de l'espace, agrégées depuis les RDV, les contacts, `data.companies` et `data.signals`. Leads
  répond à « où en est l'affaire ? », celui-ci à « que sait-on de ce compte ? ».
  ⚠️ **UNE CARTE = UNE ENTREPRISE**, pas une affaire : une société qui porte quatre deals fait ici UNE
  carte. C'est ce qui distingue durablement cet écran de Leads.
  **Deux vues** — liste (triable : nom, dernier contact, nombre de RDV, informations manquantes, signaux)
  et **kanban**. ⚠️ **L'AXE DU KANBAN SE CHOISIT** (`AXES` : ce qu'on sait / dernier contact / signaux /
  étape / secteur / taille) : le figer sur l'étape aurait refait Leads, le figer sur la complétude
  n'aurait servi qu'à préparer un enrichissement. ⚠️ **Une colonne VIDE reste affichée** (« Aucune
  entreprise ici. ») — la masquer ferait croire que la catégorie n'existe pas, alors qu'elle est
  justement l'objectif ; en revanche des FILTRES qui ne rendent rien cèdent la place au message d'absence,
  six colonnes vides n'apprenant rien.
  **Recherche** sur nom, secteur, implantation, site ET contacts — on cherche souvent « le SaaS lyonnais »
  sans se rappeler la raison sociale. **Filtres** : complétude, dernier contact (mois / trimestre / 3 mois
  sans nouvelle / jamais), signaux (à traiter / traités / aucun), étape, secteur, taille, implantation.
  ⚠️ Les valeurs proposées viennent des DONNÉES ; un secteur qu'aucune entreprise ne porte ne sélectionnerait
  rien sans qu'on sache pourquoi. Chaque carte ouvre la fiche existante (`openCompany`) ; l'écran n'invente
  aucune donnée et ne crée aucun stockage.
- **Menu sur mesure par client** — `env.navLayout = [{id,label,items:[tabId]}]`, composé dans
  l'Atelier (`NavLayoutEditor` dans `EnvAdmin.jsx`, droit `env.build`), appliqué par
  `applyNavLayout` (nav.jsx) dans la barre latérale. ⚠️ **Ranger n'accorde AUCUN accès** : la
  disposition s'applique APRÈS le filtrage par offre, rôle, module et permission — un onglet
  déplacé n'est donné à personne, un onglet absent des droits ne peut pas être fait apparaître.
  ⚠️ **Un onglet non mentionné n'est pas perdu** : il reste dans sa rubrique d'origine, sinon
  une brique livrée après la composition du menu disparaîtrait sans prévenir.
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
  ⚠️ **La fusion joue dans LES DEUX SENS, y compris au démarrage.** Quand la base locale est plus
  récente que la base commune, on poussait le local TEL QUEL : un environnement créé sur un autre
  poste — jamais vu par celui-ci — disparaissait de la base commune au simple démarrage de
  l'application, parce que ce poste avait enregistré une seconde plus tard. Symptôme : « ce client
  n'est pas accessible partout ». Le démarrage fait donc `mergeRemoteDb(remote, dbRef.current)`
  (le local fait foi, le distant complète) et pousse le RÉSULTAT. `mergeRemoteDb` est symétrique par
  construction : espaces départagés au `_rev`, `_autoSeed` réuni, environnements présents d'un seul
  côté réajoutés avec leurs sous-espaces, données et livraison — sauf pierre tombale.
  ⚠️ Limite assumée : cette réunion ne couvre que les ENVIRONNEMENTS (et ce qui y pend). `accounts`,
  `tickets`, `clients` restent au dernier écrivain — les réunir par id ressusciterait ce qui a été
  supprimé, faute de pierre tombale pour eux.
- 🔄 **Audit des synchronisations — les sept défauts trouvés et corrigés** (figés par `npm run audit`,
  section « AUDIT DES SYNCHRONISATIONS ») :
  1. **Un état distant ILLISIBLE n'est pas un état absent.** `fetchRemoteState` renvoyait `null` aussi bien
     pour « rien là-bas » que pour « blob indéchiffrable » ; le démarrage en concluait que la base commune
     était vide et poussait la locale par-dessus — le travail de tous les autres postes, effacé parce qu'on
     n'avait pas su lire. Elle renvoie désormais `{_unreadable:true}`, le démarrage **suspend la publication**
     (`remoteReady` reste faux), reste en local et le dit à l'écran.
  2. **Un seul client Supabase.** `supabaseSync.js` en fabriquait un second, sans les options d'auth : deux
     abonnements temps réel sur la même table (chaque changement traité deux fois) et une session Google posée
     sur une instance dont les requêtes de données ne se servaient pas. Tout passe par `supabaseClient.js`.
  3. **Boucle entre onglets.** Le listener `storage` adoptait à `>=` et sans marquer l'état comme distant :
     l'onglet B adoptait A, le ré-enregistrait sous une NOUVELLE estampille, réveillait A… sans fin, chaque
     tour repartant vers Supabase. Adopté à `>`, avec `applyingRemote`, et **fusionné** au lieu d'être remplacé.
  4. **`_rev` d'un espace toujours croissante** — `Math.max(Date.now(), prevRev + 1)`. Avec l'horloge seule, un
     poste qui retarde écrivait des révisions plus basses que celles qu'il venait d'adopter : ses écritures
     perdaient systématiquement à la fusion. Écrire APRÈS avoir lu l'emporte désormais, horloge ou pas.
  5. **`_ingestedRequestIds` se RÉUNIT** comme `_autoSeed` : « cette demande du site a été traitée » est un
     fait. Porté par un seul côté, il faisait ré-ingérer la demande et recréer son client et son projet en double.
  6. **Le test de connexion efface sa ligne `__healthcheck__`** au lieu de la laisser à demeure dans la table.
  7. **Les offres ne partent pas vers le site avant lecture de la base commune** (sinon les tarifs par défaut
     d'un semis local écrasent ceux réglés par le staff), et sont publiées une fois `remoteReady` acquis —
     sans quoi une première utilisation ne les publiait jamais.
  ⚠️ **Limite connue, non corrigée** : `_savedAt` (départage du blob ENTIER) reste une horloge locale. Deux
  postes aux horloges décalées peuvent s'ignorer en temps réel ; un rechargement répare, la fusion étant
  bidirectionnelle et `_rev` désormais indépendante de l'horloge. Aucune perte, seulement du retard.
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
