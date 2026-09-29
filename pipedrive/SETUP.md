# Brancher Pipedrive

Trois choses à faire, dans cet ordre. Compter dix minutes.

> ⚠️ **Ce code n'a jamais parlé à un vrai compte Pipedrive.** Il a été écrit d'après la
> documentation de l'API, et l'environnement de développement n'a aucune sortie réseau
> vers `api.pipedrive.com`. Le premier branchement est donc une **vérification**, pas
> une formalité : c'est à cela que servent « Tester la connexion » puis « Préparer le
> compte ». Si quelque chose cloche, le journal des appels en bas de l'écran donne la
> route exacte et le message de Pipedrive.

## 1. Récupérer votre jeton d'API

Dans Pipedrive : votre avatar (en haut à droite) → **Préférences personnelles** →
onglet **API** → copier le jeton.

🔑 **Ce jeton ouvre tout le compte** : affaires, contacts, montants, et le droit de les
modifier. Il ne doit jamais être collé ailleurs qu'à l'étape suivante.

## 2. Le déposer chez le relais

C'est le worker Cloudflare que vous utilisez déjà pour les signaux et l'enrichissement —
il n'y en a pas de second à déployer.

1. Recollez `news/worker.js` dans l'éditeur Cloudflare, puis **Deploy**.
2. **Settings** → **Variables and Secrets** → *Add variable*
   · Nom : `PIPEDRIVE_API_TOKEN`
   · Valeur : le jeton copié à l'étape 1
   · Type : **Secret** (et non « Text » — un secret ne se relit pas depuis le tableau de bord)

⚠️ **Pourquoi passer par le relais plutôt que par le navigateur.** Deux raisons, et la
seconde suffit : rien ne garantit que l'API accepte un appel de navigateur (CORS), et
surtout un jeton livré au navigateur est **lisible par quiconque ouvre l'inspecteur**.
Chez le relais, il ne descend jamais. Le mode « direct » de l'écran existe pour dépanner,
pas pour servir.

## 3. Régler l'application

Dans BD Report : **Gestion Manager** → **Intégration Pipedrive**.

1. **Mode** : « Relais », et collez l'URL de votre worker (la même que pour les signaux,
   sans rien ajouter — l'application complète le chemin elle-même).
2. **Tester la connexion** → le nom de votre compte Pipedrive doit s'afficher.
3. **Préparer le compte** → crée les champs BD Report manquants et charge vos pipelines.
4. Choisissez le **pipeline visé**, puis faites correspondre vos étapes.

⚠️ **L'étape 3 n'est pas facultative.** Chez Pipedrive, un champ personnalisé se désigne
par une **clé hachée propre à chaque compte**, pas par son nom. Sans elle, rien ne
permet de retrouver une affaire déjà envoyée : le premier envoi crée des affaires, et
le second en crée d'autres à côté. L'écran refuse de vous laisser l'oublier en silence.

## Ce qui part, et où

| BD Report | Pipedrive |
|---|---|
| Entreprise | organisation |
| Contact | personne (clé : e-mail) |
| Rendez-vous / affaire | affaire (clé : champ « BD Report — ID du RDV ») |
| Le créneau du rendez-vous | activité de type réunion |
| Notes du rendez-vous | note |
| Tâche | activité de type tâche |

Les envois sont **idempotents** : renvoyer deux fois met à jour, ne duplique pas — à
condition que l'étape 3 ait été faite.

Une phase gagnée ou perdue marque aussi l'affaire comme telle dans Pipedrive, avec sa
date. Sans cela, une affaire signée resterait « ouverte » dans les rapports du client —
donc fausse dans son propre outil.

## Limite connue : un seul compte

Le relais porte **un** `PIPEDRIVE_API_TOKEN` : c'est le compte de l'éditeur, pas celui
d'une entreprise cliente. Pour connecter plusieurs clients, il faudra le schéma de
`hubspot/proxy-worker.js` — un jeton par locataire en KV, désigné par les en-têtes
`X-BDR-Tenant` / `X-BDR-Key`. Le client de l'application **les envoie déjà** : le jour
venu, seul le bloc `/pipedrive/` du worker change.

## Si ça ne marche pas

- **« Aucun jeton Pipedrive configuré »** → le secret de l'étape 2 manque, ou le worker
  n'a pas été redéployé depuis.
- **« Chemin non autorisé »** → le relais n'ouvre que les routes dont l'application a
  besoin. C'est voulu : sans cette liste, son URL donnerait un accès anonyme et complet
  à votre compte Pipedrive.
- **« Appel bloqué par le navigateur (CORS) »** → vous êtes en mode direct. Repassez en
  mode relais.
- **Autre chose** → le journal des appels, en bas de l'écran, donne la route, la durée
  et le message rendu par Pipedrive.
