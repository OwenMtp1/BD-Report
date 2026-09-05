# Intégration HubSpot — guide de déploiement (côté éditeur)

BD Report permet à **chaque entreprise cliente de relier son propre portail HubSpot**
en un clic, sans jamais copier de jeton. Tout le code applicatif est déjà en place.
Il vous reste **trois choses à faire, une seule fois** :

1. créer l'application HubSpot (celle de BD Report, pas celle du client) ;
2. déployer le connecteur (Cloudflare Worker) ;
3. coller son URL dans BD Report.

Comptez ~20 minutes. Le mode d'emploi destiné aux clients est publié automatiquement
dans la base de connaissances du support (« Connecter votre HubSpot à BD Report »).

---

## Comment ça marche

```
Client                    BD Report (front)          Connecteur (Worker)        HubSpot
  │  « Connecter »              │                            │                     │
  ├────────────────────────────>│  /oauth/start ────────────>│  redirection ──────>│
  │                             │                            │   autorisation      │
  │<────────────────────────────┴────────────────────────────┤<─── code ───────────┤
  │                                            échange code ─┼────────────────────>│
  │                                    jetons stockés en KV  │<── access+refresh ──┤
  │                             │<── postMessage {portalId} ─┤                     │
  │   appels API : X-BDR-Tenant + X-BDR-Key ────────────────>│ ── Bearer <jeton> ─>│
```

- **Un seul connecteur** pour tous les clients, mais **un jeu de jetons par entreprise**,
  rangé dans un espace KV Cloudflare sous la clé `tenant:<id de l'environnement>`.
- L'app ne détient **jamais** de jeton HubSpot : seulement un couple
  `{tenantId, tenantKey}` qui dit au connecteur quel portail viser.
- Le jeton d'accès est **rafraîchi automatiquement** par le connecteur (refresh token).

---

## 1. Créer l'application HubSpot (côté éditeur)

Dans un **compte développeur HubSpot** (gratuit : <https://developers.hubspot.com/>) :
**Applications → Créer une application**.

- Onglet **Auth** :
  - **URL de redirection** : `https://<votre-worker>.workers.dev/oauth/callback`
    (exactement la même valeur que `HUBSPOT_REDIRECT_URI` plus bas) ;
  - notez le **Client ID** et le **Client secret**.
- Onglet **Auth → Scopes**, cochez au minimum :

| Besoin | Scopes |
|---|---|
| Contacts | `crm.objects.contacts.read`, `crm.objects.contacts.write` |
| Entreprises | `crm.objects.companies.read`, `crm.objects.companies.write` |
| Transactions | `crm.objects.deals.read`, `crm.objects.deals.write` |
| Champs personnalisés | `crm.schemas.contacts.read/write`, `crm.schemas.companies.read/write`, `crm.schemas.deals.read/write` |
| Propriétaires | `crm.objects.owners.read` |
| OAuth | `oauth` |

Et en **scopes facultatifs** (`optional_scope` — la connexion aboutit même si le
portail du client ne les propose pas) :
`crm.objects.meetings.read/write`, `crm.objects.notes.read/write`,
`crm.objects.tasks.read/write`, `tickets`.

> La liste des scopes du connecteur (`DEFAULT_SCOPES` / `DEFAULT_OPTIONAL_SCOPES` dans
> `proxy-worker.js`) doit correspondre à celle de l'application, sinon HubSpot refuse
> l'URL d'autorisation. Vous pouvez aussi la piloter par variables
> (`HUBSPOT_SCOPES`, `HUBSPOT_OPTIONAL_SCOPES`) sans toucher au code.

---

## 2. Déployer le connecteur (Cloudflare Workers, gratuit)

```bash
cd hubspot
npx wrangler login

# Espace de stockage des connexions clients (un enregistrement par entreprise)
npx wrangler kv namespace create TENANTS      # → recopiez l'id dans wrangler.toml

# Secrets
npx wrangler secret put HUBSPOT_CLIENT_ID       # Client ID de l'application
npx wrangler secret put HUBSPOT_CLIENT_SECRET   # Client secret
npx wrangler secret put STATE_SECRET            # chaîne aléatoire longue (openssl rand -hex 32)
npx wrangler secret put SHARED_SECRET           # optionnel

npx wrangler deploy
```

Éditez `wrangler.toml` avant le `deploy` :
- `id` du binding KV `TENANTS` (renvoyé par la commande ci-dessus) ;
- `ALLOWED_ORIGINS` : `https://bdreport.js.org,http://localhost:5173` ;
- `HUBSPOT_REDIRECT_URI` : `https://<votre-worker>.workers.dev/oauth/callback`.

Wrangler renvoie l'URL du Worker : c'est **l'URL du connecteur**.

### Variables d'environnement

| Variable | Rôle |
|---|---|
| `HUBSPOT_CLIENT_ID` | **requis** — application HubSpot de BD Report |
| `HUBSPOT_CLIENT_SECRET` | **requis** — idem |
| `HUBSPOT_REDIRECT_URI` | **requis** — `https://<worker>/oauth/callback`, identique côté HubSpot |
| `STATE_SECRET` | **requis** — signe l'état OAuth et hache les clés d'entreprise |
| `ALLOWED_ORIGINS` | origines autorisées, séparées par des virgules |
| `TENANTS` (KV) | **requis** — stockage des connexions par entreprise |
| `HUBSPOT_SCOPES` / `HUBSPOT_OPTIONAL_SCOPES` | optionnels — surchargent les scopes demandés |
| `HUBSPOT_TOKEN` | optionnel — jeton unique de repli (appels sans entreprise) |
| `SHARED_SECRET` | optionnel — valeur attendue dans l'en-tête `X-BDR-Secret` |

### Autre plateforme

`proxy-worker.js` est une fonction `fetch(request, env)` standard : adaptez la signature
(Vercel `handler(req, res)`, Supabase `Deno.serve`) en remplaçant l'accès KV
(`env.TENANTS.get/put/delete`) par votre stockage (Postgres, Redis, KV maison).
Les blocs sont indépendants : CORS, `/oauth/*`, `/tenant/*`, relais générique.

---

## 3. Publier l'URL du connecteur dans BD Report

Connecté avec un compte **Fondateur / Support BD Report** :
**Administration → Intégration HubSpot → « Afficher les réglages avancés »**
→ champ **URL du connecteur**. La valeur est enregistrée au niveau **éditeur** :
tous les clients en héritent, ils n'ont donc rien à saisir.

C'est tout. Chaque entreprise voit alors le bouton « Connecter mon HubSpot ».

---

## 4. Routes du connecteur

| Route | Rôle |
|---|---|
| `GET /oauth/start?tenant&key&origin&label` | démarre l'autorisation (état signé, redirection HubSpot) |
| `GET /oauth/callback?code&state` | échange le code, range les jetons, renvoie le résultat à l'app |
| `GET /tenant/status` | état de la connexion de l'entreprise appelante |
| `POST /tenant/token` | repli : range un jeton d'application privée pour cette entreprise |
| `POST /tenant/disconnect` | révoque le refresh token et efface l'enregistrement |
| `/crm/v3/*`, `/crm/v4/*`, `/account-info/v3/*`, … | relais API avec le jeton du bon portail |

Authentification des appels : en-têtes `X-BDR-Tenant` (id de l'environnement) et
`X-BDR-Key` (clé d'entreprise, hachée côté connecteur avec `STATE_SECRET`).
Un portail déjà relié ne peut être réécrit qu'avec sa propre clé.

---

## 5. Ce qui part vers HubSpot (chez le client)

| BD Report | HubSpot | Clé d'unicité |
|---|---|---|
| Entreprise d'un RDV | `company` | `name` |
| Contacts d'un RDV | `contact` | `email` |
| Rendez-vous (RDV) | `deal` | propriété `bdr_rdv_id` |
| Créneau du RDV | `meeting` | — |
| Notes du RDV | `note` | — |
| Tâches | `task` | — |

Associations posées automatiquement, envois **idempotents** (un second envoi met à jour).

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

## 6. Bon à savoir

- **Quotas** : ~100 requêtes / 10 s et 250 000 / jour **par portail client** (donc pas de
  file d'attente partagée entre vos clients). Le client réessaie sur `429` en respectant
  `Retry-After`.
- **Révocation** : le client peut retirer l'autorisation depuis HubSpot
  (Paramètres → Intégrations → Applications connectées) ou via « Déconnecter ».
  Les appels renvoient alors `401` et l'app invite à reconnecter.
- **Limite du modèle** : la clé d'entreprise vit dans l'état synchronisé de
  l'environnement (visible de ses seuls membres). Elle autorise l'accès au portail relié,
  pas les jetons eux-mêmes, qui ne quittent jamais le connecteur. Un durcissement complet
  (clé liée à une session authentifiée) suppose Supabase Auth + RLS — voir
  `supabase/SETUP.md`.
- **Modes secondaires** (réglages avancés) : « relais avec jeton unique » (un seul portail,
  celui de l'éditeur) et « API directe + jeton local » (poste isolé, hors navigateur).
- **Explorateur d'API** : la console liste tous les appels et les exécute en un clic —
  le moyen le plus rapide de repérer un scope manquant.
