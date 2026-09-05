# Intégration HubSpot — guide de mise en place

Tout ce qui est **côté BD Report** est déjà fait (client API complet, écran de connexion,
correspondances, synchronisation, explorateur d'appels). Il vous reste **la partie HubSpot** :
créer l'application privée et déployer le relais. Comptez ~10 minutes.

---

## 1. Créer l'application privée HubSpot

1. Dans HubSpot : **Paramètres → Intégrations → Applications privées → Créer une application privée**.
2. Onglet **Périmètres (scopes)**, cochez au minimum :

| Besoin | Scopes |
|---|---|
| Contacts | `crm.objects.contacts.read`, `crm.objects.contacts.write` |
| Entreprises | `crm.objects.companies.read`, `crm.objects.companies.write` |
| Transactions | `crm.objects.deals.read`, `crm.objects.deals.write` |
| RDV / notes / tâches | `crm.objects.meetings.read/write`, `crm.objects.notes.read/write`, `crm.objects.tasks.read/write` |
| Champs personnalisés | `crm.schemas.contacts.read/write`, `crm.schemas.companies.read/write`, `crm.schemas.deals.read/write` |
| Pipelines & propriétaires | `crm.pipelines.orders.read` (ou lecture pipelines), `crm.objects.owners.read` |
| Listes (optionnel) | `crm.lists.read`, `crm.lists.write` |
| Tickets (optionnel) | `tickets` |

3. Créez l'application et **copiez le jeton** (`pat-eu1-…`). Il ne s'affiche qu'une fois.
4. Notez votre **Hub ID** (identifiant de portail), visible en haut à droite dans HubSpot.

> ⚠️ Ce jeton donne un accès complet aux données cochées. Ne le collez jamais dans un dépôt public.

---

## 2. Déployer le relais (obligatoire pour une app web)

L'API HubSpot **n'envoie pas d'en-têtes CORS** : un navigateur ne peut pas l'appeler directement.
Le relais fourni règle ce point et garde le jeton côté serveur.

### Option A — Cloudflare Workers (gratuit, ~3 min)

```bash
npm install -g wrangler
wrangler login
cd hubspot
wrangler init bdr-hubspot-proxy --no-git        # puis remplacez src/index.js par proxy-worker.js
wrangler secret put HUBSPOT_TOKEN               # collez le jeton pat-…
wrangler secret put ALLOWED_ORIGINS             # ex : https://bdreport.js.org,http://localhost:5173
wrangler secret put SHARED_SECRET               # optionnel, recommandé
wrangler deploy
```

Wrangler vous renvoie une URL du type `https://bdr-hubspot-proxy.<compte>.workers.dev` :
c'est **l'URL de relais** à coller dans BD Report.

### Option B — Vercel / Netlify / Supabase Edge Function

Le fichier `proxy-worker.js` est une fonction `fetch(request, env)` standard : adaptez la
signature à votre plateforme (`export default async function handler(req, res)` sur Vercel,
`Deno.serve` sur Supabase) en conservant la même logique — les trois blocs sont indépendants :
préflight CORS, contrôle d'origine/secret, relais vers `https://api.hubapi.com`.

### Variables d'environnement

| Variable | Rôle |
|---|---|
| `HUBSPOT_TOKEN` | **requis** — jeton de l'application privée |
| `ALLOWED_ORIGINS` | origines autorisées, séparées par des virgules (vide = tout autoriser) |
| `SHARED_SECRET` | optionnel — valeur attendue dans l'en-tête `X-BDR-Secret` |
| `HUBSPOT_CLIENT_ID` / `HUBSPOT_CLIENT_SECRET` | optionnels — uniquement pour l'OAuth |

---

## 3. Relier BD Report

Dans l'app : **Administration → Intégration HubSpot**.

1. **Mode** : « Relais CORS » ; collez l'**URL du relais** et votre **Hub ID**.
   Laissez le champ jeton vide (le relais le détient déjà).
2. Cliquez **Tester la connexion** → vous devez voir « Connexion HubSpot OK ✓ ».
3. Cliquez **Créer les propriétés BD Report** : crée dans HubSpot les champs
   `bdr_rdv_id`, `bdr_phase`, `bdr_provenance`, `bdr_source`, `bdr_date_sql`, `bdr_effectif`… (idempotent).
4. Cliquez **Charger pipelines & propriétaires**, choisissez votre pipeline, puis faites
   correspondre chaque phase BD Report à une étape HubSpot.
5. Cochez **Activer l'intégration**, puis synchronisez.

---

## 4. Ce qui part vers HubSpot

| BD Report | HubSpot | Clé d'unicité |
|---|---|---|
| Entreprise d'un RDV | `company` | `name` |
| Contacts d'un RDV | `contact` | `email` |
| Rendez-vous (RDV) | `deal` | propriété `bdr_rdv_id` |
| Créneau du RDV | `meeting` | — |
| Notes du RDV | `note` | — |
| Tâches | `task` | — |

Toutes les associations (transaction ↔ entreprise ↔ contacts ↔ rendez-vous) sont posées
automatiquement. Les envois sont **idempotents** : un second envoi met à jour au lieu de dupliquer.

Correspondance des phases par défaut :

| Phase BD Report | Étape HubSpot |
|---|---|
| R1 | `appointmentscheduled` |
| R2 | `qualifiedtobuy` |
| MQL | `presentationscheduled` |
| SQL | `decisionmakerboughtin` |
| Signée | `closedwon` |
| KO | `closedlost` |

L'issue commerciale (Gagnée / Perdue) prime sur la phase.

---

## 5. Bon à savoir

- **Quotas** : ~100 requêtes / 10 s et 250 000 / jour selon votre offre. Le client réessaie
  automatiquement sur `429` en respectant `Retry-After`.
- **Envoi automatique** : l'option « Envoyer automatiquement à chaque enregistrement » pousse
  chaque RDV créé ou modifié (avec 1,5 s de délai). Elle n'envoie rien au chargement de l'app.
- **Jeton en mode direct** : stocké en `localStorage` sur l'appareil uniquement — jamais
  synchronisé ni visible par les autres utilisateurs.
- **Explorateur d'API** : la console liste tous les appels disponibles et les exécute en un clic —
  c'est le moyen le plus rapide de vérifier qu'un scope manque.
