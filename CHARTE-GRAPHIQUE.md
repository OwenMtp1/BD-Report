# Charte graphique — BD Report

## 1. Le nom & la promesse

**BD Report** — l'espace sales tout-en-un des BDR / SDR.
Baseline : **« Pilotez votre prospection. Encaissez vos primes. »**
(EN : *"Run your pipeline. Cash your bonuses."*)

## 2. Le logo

Le logo combine deux idées : le **reporting** (trois barres ascendantes, arrondies, en dégradé inversé d'opacité) et le **signal d'activité** (pastille verte « pulse » en haut à droite, comme un statut en ligne).

- **Monogramme** : carré arrondi (rayon ≈ 23 % du côté) en dégradé Bleu Report → Cyan Pulse, barres blanches, pastille menthe.
- **Logotype** : « **BD** » en Bleu Report gras + « Report » en Encre — toujours en Inter Extra-Bold, espacement resserré (`tracking-tight`).
- **Zone de protection** : un demi-module (la largeur d'une barre) autour du logo.
- **Tailles minimales** : monogramme 24 px, logo complet 100 px de large.
- **Interdits** : ne pas déformer, ne pas changer l'ordre des couleurs du dégradé, ne pas poser le monogramme sur un fond saturé sans la version blanche du logotype.

Fichiers : `public/icon.svg` (monogramme), composants React `src/Brand.jsx` (`LogoMark`, `Wordmark`, `Logo`).

## 3. Palette de couleurs

### Couleurs de marque
| Nom | Hex | Usage |
|---|---|---|
| **Bleu Report** | `#3B5BDB` | Couleur principale : actions, liens, marque |
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
