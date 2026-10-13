import React from 'react'

// ---------------------------------------------------------------- Identité BD Report
// Charte : voir CHARTE-GRAPHIQUE.md — logo « bloc entonnoir » : bleu roi #1D3FD6 + menthe #2EE6A8 (brand/logo.mjs).

export function LogoMark({ size = 36 }) {
  // Copie de brand/logo.mjs (source unique) : carré bleu roi, D en quatre bandes qui
  // s'affinent (le pipeline), la dernière — l'affaire signée — en menthe.
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="BD Report">
      <rect width="64" height="64" rx="15" fill="#1D3FD6" />
      <path d="M17.6 16.16H30.56A15.84 15.84 0 0 1 44.67 24.8H17.6ZM17.6 26.96H45.58A15.84 15.84 0 0 1 46.3 33.8H17.6ZM17.6 35.96H45.9A15.84 15.84 0 0 1 43.34 41.36H17.6Z" fill="#ffffff" />
      <path d="M17.6 43.52H41.43A15.84 15.84 0 0 1 30.56 47.84H17.6Z" fill="#2EE6A8" />
    </svg>
  )
}

export function Wordmark({ className = '', light = false }) {
  return (
    <span className={`font-extrabold tracking-tight ${className}`}>
      <span className={light ? 'text-white' : 'text-brand'}>BD</span>
      <span className={light ? 'text-white/85' : 'text-ink'}> Report</span>
    </span>
  )
}

export function Logo({ size = 34, text = true, light = false, textClass = 'text-lg' }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      {text && <Wordmark light={light} className={textClass} />}
    </span>
  )
}

// Écran de chargement SaaS : logo animé + barre de progression
export function SplashScreen() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6"
      style={{ background: 'linear-gradient(135deg, #10162e 0%, #1e2a52 45%, #14346b 100%)' }}>
      <div className="splash-logo"><LogoMark size={84} /></div>
      <div className="text-center">
        <div className="text-3xl font-extrabold tracking-tight">
          <span className="text-white">BD</span><span className="text-sky-300"> Report</span>
        </div>
        <div className="text-sm text-white/60 mt-1">Pilotez votre prospection. Encaissez vos primes.</div>
      </div>
      <div className="w-52 h-1 rounded-full bg-white/15 overflow-hidden">
        <div className="splash-bar h-full rounded-full" style={{ background: 'linear-gradient(90deg,#1D3FD6,#2EE6A8)' }} />
      </div>
    </div>
  )
}
