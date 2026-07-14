// Point d'entrée de la version autonome (fichier HTML unique) du générateur de CV.
import React from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import { StandaloneProvider } from '../src/cv/standaloneStore.jsx'
import CvGenerator from '../src/pages/CvGenerator.jsx'
import { Toasts } from '../src/ui.jsx'

function App() {
  return (
    <StandaloneProvider>
      <div className="min-h-screen bg-surface">
        <header className="bg-card border-b border-line">
          <div className="max-w-6xl mx-auto px-5 py-3 flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand to-brand2 flex items-center justify-center text-white font-extrabold text-sm">CV</span>
            <span className="font-extrabold text-ink text-lg">Générateur de CV</span>
            <span className="ml-auto text-xs text-muted">Vos CV sont enregistrés dans ce navigateur</span>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-5 py-6">
          <CvGenerator />
        </main>
      </div>
      <Toasts />
    </StandaloneProvider>
  )
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
