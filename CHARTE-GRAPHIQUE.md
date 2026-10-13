# Charte graphique — BD Report

## 1. Le nom & la promesse

**BD Report** — l'espace sales tout-en-un des BDR / SDR.
Baseline : **« Pilotez votre prospection. Encaissez vos primes. »**
(EN : *"Run your pipeline. Cash your bonuses."*)

## 2. Le logo — « bloc entonnoir »

Un **carré bleu roi** dans lequel est découpé un **D en quatre bandes**, de plus en plus fines en
descendant : premiers RDV, R2, SQL, signatures — la forme réelle d'un pipeline. La dernière bande,
**l'affaire signée**, est en **menthe**. Aucun dégradé, aucun code visuel « IA ».

- **Monogramme** : carré plein `#1D3FD6`, coins 15/64 du côté ; bandes blanches ; bande du bas `#2EE6A8`.
- **Logotype** : « **BD** » Inter Extra-Bold + « Report » Inter Regular, interlettrage resserré.
  Texte `#14171C` sur fond clair, blanc sur fond sombre. Le monogramme, lui, ne change JAMAIS de couleur.
- **Zone de protection** : un quart du monogramme tout autour.
- **Taille minimale** : 16 px (favicon) — le contraste menthe/bleu a été choisi pour tenir à cette taille.
- **Interdits** : déformer, recolorer la bande menthe (le violet a été essayé : trop proche du bleu,
  la bande disparaissait), ajouter un dégradé ou une ombre.

**Source unique : `brand/logo.mjs`.** `node brand/logo.mjs` régénère `brand/*.svg`, `brand/*.png`
(sigle 512/1024, logo horizontal noir et blanc 1760 px) et `public/icon.svg` — d'où partent le favicon
du site et de l'app, le manifeste et les icônes de l'app de bureau (générées par la release).
Le site, `src/Brand.jsx`, la vidéo et les bannières portent une copie du tracé : changer le logo,
c'est changer `logo.mjs` puis remplacer ces copies.

## 3. Palette de couleurs

### Couleurs de marque
| Nom | Hex | Usage |
|---|---|---|
| **Bleu roi (logo)** | `#1D3FD6` | Le monogramme, le « BD » du logotype |
| **Menthe (logo)** | `#2EE6A8` | La bande signée du monogramme, rien d'autre |
| **Bleu Report** | `#3B5BDB` | Couleur principale de l'interface : actions, liens |
| **Cyan Pulse** | `#0EA5E9` | Dégradés, accents secondaires |
| **Encre** | `#172033` | Texte principal |
| **Nuit Report** | `#10162E` | Fonds sombres (splash, hero) |

### Couleurs fonctionnelles
| Nom | Hex | Usage |
|---|---|---|
| Menthe (succès) | `#10B981` | Validations, primes, signatures |
| Ambre (attention) | `#F59E0B` | Alertes douces, opportunités en cours |
| Rouge (critique) | `#EF4444` | Erreurs, SQL, suppressions |
| Rose (performance) | `#EC4899` | Jauges de performance |

### Neutres
Gris texte secondaire `#647085` · Bordures `#E2E6EE` · Fond d'app `#F4F6FA` · Cartes `#FFFFFF`.

### Dégradé signature
`linear-gradient(135°, #3B5BDB → #0EA5E9)` — réservé au logo, aux CTA primaires du site et aux fonds de hero.

## 4. Typographie

- **Police unique : Inter** (Google Fonts), fallback `system-ui, sans-serif`.
- Titres : Extra-Bold (800), interlettrage resserré.
- Corps : Regular (400) / Semi-Bold (600) pour les emphases.
- Données chiffrées : Extra-Bold, grande taille — les chiffres sont les héros de l'interface.
- Étiquettes : 11px, capitales, Semi-Bold, gris secondaire.

## 5. Formes & composants

- **Coins arrondis généreux** : cartes 16 px, boutons 8–12 px, pastilles en capsule.
- **Cartes** : fond blanc, bordure 1 px `#E2E6EE`, ombre très légère. Pas d'ombres lourdes.
- **Boutons** : primaire = fond Bleu Report texte blanc ; secondaire = bordure + fond transparent ; danger = rouge. Toujours avec icône Lucide 14–16 px à gauche.
- **Chips de statut** : capsule, fond teinté à 10–15 %, texte de la couleur à 700.
- **Iconographie** : [Lucide](https://lucide.dev), trait 2 px, tailles 14/16/19 px.

## 6. Ton & voix

- Français direct, métier (BDR, SQL, prime) ; tutoiement proscrit dans l'interface, impératif d'action sur les boutons (« Créer un RDV », « Exporter »).
- Les confirmations célèbrent (🎉, 🏆) ; les alertes expliquent et proposent la prochaine action.

## 7. Thèmes

Le thème par défaut « Océan Pro » applique la palette ci-dessus. Les 19 autres thèmes (dont 10 ambiances animées) recolorent l'interface via les variables CSS (`--brand`, `--surface`…) sans jamais toucher au logo, qui reste en couleurs de marque.
