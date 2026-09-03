import React, { useState } from 'react'
import { Play, Sparkles, MousePointerClick, UserCog, Route } from 'lucide-react'
import DemoJourney from './DemoJourney.jsx'

// Lanceur du parcours de démo commerciale immersif (plein écran, isolé).
export default function DemoSales() {
  const [started, setStarted] = useState(false)
  return (
    <div>
      <div className="rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#10162e,#1e2a52 45%,#14346b)' }}>
        <span className="chip" style={{ background: 'rgba(94,220,255,.15)', color: '#5EDCFF' }}>▶ Présentation client · environnement isolé</span>
        <h2 className="text-2xl sm:text-3xl font-extrabold mt-3 max-w-2xl">Déroulez tout le parcours BD Report, en direct devant votre prospect</h2>
        <p className="text-white/70 text-sm mt-2 max-w-2xl">Un environnement de démonstration complet, rempli de données fictives — création de compte, interface employé et manager, et une visite guidée qui présente chaque fonctionnalité, brique par brique. Rien n'est enregistré, aucun compte réel n'est touché.</p>
        <button className="btn-primary mt-5" onClick={() => setStarted(true)}><Play size={16} /> Démarrer la démo</button>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 max-w-3xl">
          {[[Route, 'Parcours d\'achat complet', 'De la création de compte à l\'usage quotidien.'],
            [UserCog, 'Employé ⇄ Manager', 'Bascule instantanée pour montrer les deux casquettes.'],
            [MousePointerClick, 'Visite guidée animée', 'Un pas‑à‑pas qui parcourt chaque onglet et chaque brique.']].map(([Ic, t, x], i) => (
            <div key={i} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,.06)' }}>
              <Ic size={18} className="mb-1.5" style={{ color: '#5EDCFF' }} />
              <div className="font-bold text-sm">{t}</div><div className="text-xs text-white/55">{x}</div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted mt-3 flex items-center gap-1.5"><Sparkles size={13} className="text-brand" /> Astuce : lancez la démo, puis « Visite guidée » — idéal en plein rendez‑vous commercial.</p>

      {started && <DemoJourney onClose={() => setStarted(false)} />}
    </div>
  )
}
