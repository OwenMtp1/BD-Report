import React from 'react'

// ---------------------------------------------------------------- Identité BD Report
// Charte : voir CHARTE-GRAPHIQUE.md — Bleu Report #3B5BDB → Cyan Pulse #0EA5E9, Inter, coins arrondis.

export function LogoMark({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="BD Report">
      <defs>
        <linearGradient id="bdr-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3B5BDB" />
          <stop offset="1" stopColor="#0EA5E9" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#bdr-g)" />
      {/* Barres de reporting ascendantes */}
      <rect x="13" y="34" width="9" height="17" rx="4.5" fill="#ffffff" opacity=".75" />
      <rect x="27" y="26" width="9" height="25" rx="4.5" fill="#ffffff" opacity=".9" />
      <rect x="41" y="16" width="9" height="35" rx="4.5" fill="#ffffff" />
      {/* Pulse */}
      <circle cx="45.5" cy="11" r="4" fill="#A7F3D0" />
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
        <div className="splash-bar h-full rounded-full" style={{ background: 'linear-gradient(90deg,#3B5BDB,#0EA5E9)' }} />
      </div>
    </div>
  )
}
