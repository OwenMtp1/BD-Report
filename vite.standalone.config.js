// Build de la version AUTONOME du générateur de CV → un fichier HTML unique
// (tout inliné, fonctionne hors-ligne en double-cliquant le fichier).
//   npx vite build --config vite.standalone.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const root = path.dirname(fileURLToPath(import.meta.url))
const shim = path.join(root, 'src/cv/standaloneStore.jsx')

// Remplace le store principal (login/multi-espaces) par le store autonome localStorage.
const storeShim = {
  name: 'cv-store-shim',
  enforce: 'pre',
  resolveId(source) {
    if (source === '../store.jsx' || source.endsWith('/src/store.jsx')) return shim
    return null
  },
}

// Inline le JS + CSS émis dans un seul fichier HTML.
const inlineSingleFile = {
  name: 'cv-inline-single-file',
  writeBundle(options, bundle) {
    const outDir = options.dir
    let js = '', css = ''
    for (const f of Object.values(bundle)) {
      if (f.type === 'chunk' && f.isEntry) js = f.code
      else if (f.type === 'asset' && f.fileName.endsWith('.css')) css = String(f.source)
    }
    const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Générateur de CV</title>
<meta name="theme-color" content="#3b5bdb" />
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script type="module">${js}</script>
</body>
</html>`
    fs.writeFileSync(path.join(outDir, 'generateur-de-cv.html'), html)
    // nettoyage des fichiers intermédiaires
    for (const f of Object.keys(bundle)) { try { fs.rmSync(path.join(outDir, f)) } catch (e) {} }
    try { fs.rmSync(path.join(outDir, 'assets'), { recursive: true, force: true }) } catch (e) {}
  },
}

export default defineConfig({
  root: path.join(root, 'standalone'),
  plugins: [storeShim, react(), inlineSingleFile],
  build: {
    outDir: path.join(root, 'dist-standalone'),
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: {
      input: path.join(root, 'standalone/index.html'),
      output: { inlineDynamicImports: true, manualChunks: undefined },
    },
  },
})
