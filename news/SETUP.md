# Relais « Actualités » — à déployer UNE FOIS par l'éditeur

Le bouton **📰 Actualités** de chaque fiche entreprise a besoin de ce relais. Sans lui, le
panneau s'ouvre et le dit clairement : la fonctionnalité reste inerte, elle ne casse rien.

## Pourquoi un relais — et pas du code dans l'application

BD Report est une application **100 % front**, servie en fichiers statiques. Deux choses sont
donc impossibles depuis le navigateur, et aucune astuce de code n'y changera quoi que ce soit :

1. **Lire Google News.** Le flux RSS ne renvoie aucun en-tête CORS : le navigateur refuse
   l'appel avant même qu'il parte.
2. **Tenir la clé Gemini.** Une clé placée dans le bundle est publique — n'importe quel
   visiteur peut la lire dans le code livré et s'en servir à vos frais.

Le relais résout les deux : il appelle Google News et Gemini depuis le serveur, et l'application
ne lui envoie jamais qu'un nom d'entreprise. **La clé ne descend jamais dans le navigateur.**

C'est exactement le modèle déjà retenu pour HubSpot (`hubspot/SETUP.md`).

## 1. Obtenir une clé Gemini

1. Ouvrez [Google AI Studio](https://aistudio.google.com/app/apikey).
2. **Create API key** — l'offre gratuite suffit largement pour cet usage (une analyse par
   entreprise et par jour, au plus).
3. Copiez la clé, ne la collez nulle part ailleurs que dans la commande de l'étape 3.

## 2. Déployer le Worker

```bash
cd news
npx wrangler login
```

Ouvrez `wrangler.toml` et vérifiez `ALLOWED_ORIGINS` : ce sont les seules origines autorisées
à appeler le relais. Mettez-y l'URL réelle de l'application (et `http://localhost:5173` si
vous développez en local).

## 3. Déposer la clé, puis publier

```bash
npx wrangler secret put GEMINI_API_KEY     # colle la clé quand il la demande
npx wrangler deploy
```

Wrangler affiche l'URL du Worker, par exemple
`https://bdr-news.votre-compte.workers.dev`.

## 4. Publier l'URL dans l'application

Dans BD Report, en tant que **Fondateur ou Support BD Report** :

**Paramètres → Intégrations → Actualités des entreprises** → collez l'URL → **Tester le relais**.

Le test dit trois choses : le relais répond, il accepte votre origine, et il a bien une clé
Gemini. Un relais joignable *sans* clé est signalé comme tel — il saurait chercher les
dépêches, pas les analyser.

L'URL est publiée à tous les clients : personne d'autre n'a rien à configurer.

## Ce que fait le relais

| Route | Rôle |
|---|---|
| `GET /news?q=<entreprise>` | Google News RSS (FR), 30 derniers jours, doublons retirés, 20 articles au plus |
| `POST /analyze` | Envoie ces articles à Gemini, renvoie au plus 5 signaux commerciaux |
| `GET /health` | Diagnostic : le relais répond-il, et a-t-il une clé ? |

## Garde-fous

- **L'IA ne travaille que sur les articles fournis.** La consigne le lui interdit explicitement,
  et le relais **retire toute URL absente des articles envoyés** — un modèle qui inventerait une
  source enverrait sinon un commercial vers une page qui n'existe pas.
- Chaque champ renvoyé est borné et retypé côté relais : un score reste entre 0 et 100, une
  urgence reste l'une des trois valeurs prévues, la liste est tronquée à 5.
- **L'analyse ne part jamais toute seule.** Elle attend le bouton « Analyser avec l'IA » :
  analyser à l'ouverture de chaque fiche reviendrait à payer pour des articles que personne ne lit.
- Côté application, les résultats sont gardés **24 h** en cache local. « Actualiser les
  actualités » force une nouvelle recherche.

## Coût

L'offre gratuite de Gemini couvre un usage normal. Chaque analyse consomme un appel ;
le cache de 24 h fait qu'une même entreprise n'en déclenche qu'un par jour, et seulement
si quelqu'un le demande.
