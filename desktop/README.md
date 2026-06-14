# Application de bureau BD Report (Tauri)

L'app web est empaquetée en application native **Windows / macOS / Linux** avec
[Tauri](https://tauri.app) (installeurs très légers, ~5–10 Mo, qui réutilisent
le webview du système). Le frontend est exactement le build Vite (`dist/`).

## Comment ça se construit
Les installeurs sont produits **par GitHub Actions** (workflow
`.github/workflows/desktop-release.yml`) sur des machines Windows, macOS et
Linux — pas en local. Étapes du workflow :
1. `npm install`
2. `npx tauri icon public/icon.svg` → génère les icônes (`src-tauri/icons/`).
3. `tauri build` (via `tauri-action`) → compile et **publie une release GitHub**
   avec les installeurs en pièces jointes (`.msi`/`.exe`, `.dmg`, `.AppImage`/`.deb`).

## Déclencher une release
- **Recommandé** : créer et pousser un tag `vX.Y.Z` (ex. `v1.16.0`). Le tag doit
  être sur un commit qui contient ce workflow.
  ```bash
  git tag v1.16.0 && git push origin v1.16.0
  ```
- **Manuel** : onglet *Actions* → *Desktop release (Tauri)* → *Run workflow*
  (nécessite que le workflow soit présent sur la branche par défaut `main`).

> Pré-requis : activer **GitHub Actions** sur le dépôt. La publication utilise le
> `GITHUB_TOKEN` automatique (rien à configurer).

## Signature de code (optionnel, recommandé avant diffusion large)
Les builds sont **non signées** par défaut → un avertissement de sécurité
apparaît au premier lancement (macOS : clic droit → *Ouvrir* ; Windows :
*Informations complémentaires* → *Exécuter quand même*). Pour les signer :
- **macOS** : compte Apple Developer (99 $/an) + notarisation (variables
  `APPLE_CERTIFICATE`, `APPLE_ID`, etc. dans les secrets, gérées par `tauri-action`).
- **Windows** : certificat de signature de code (variables de signature Tauri).

## Téléchargement
Les boutons du site (section « Applications ») et l'app (Paramètres →
Télécharger) pointent vers la dernière release :
`https://github.com/OwenMtp1/Claude/releases/latest`.

## Dev local (si tu installes l'outillage Tauri)
```bash
npm install
npx tauri icon public/icon.svg   # une fois, pour générer les icônes
npm run tauri dev                # fenêtre de dev
npm run tauri build              # installeur local
```
Pré-requis : Rust (rustup) + dépendances système (voir docs Tauri).
