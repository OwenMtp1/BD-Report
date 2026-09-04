import React, { useState } from 'react'
import { Gift, Check, X, Users, User, Sparkles, ArrowRight } from 'lucide-react'
import { useStore, BRICKS, fmtMoney } from '../store.jsx'
import { Empty, Confirm, toast } from '../ui.jsx'

// Page « Souscrire à une offre » : liste dynamiquement les offres proposées par le staff,
// ce qu'elles incluent (et ce qu'elles n'incluent pas), et permet de souscrire (ouvre un
// ticket au support). Se met à jour automatiquement dès que le staff ajoute / retire une
// offre ou en modifie la description (elle lit db.offers en direct).
export default function Souscrire() {
  const store = useStore()
  const offers = store.offers()
  const current = store.account?.plan
  const [confirm, setConfirm] = useState(null)

  const priceOf = (o) => o.priceLabel || (o.price > 0 ? fmtMoney(o.price) + ' / mois' : 'Gratuit')

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold flex items-center gap-2"><Gift size={20} className="text-brand" /> Souscrire à une offre</h2>
        <p className="text-xs text-muted -mt-0.5">Choisissez l'offre adaptée à votre besoin. La souscription ouvre une demande au support BD Report, qui l'activera.</p>
      </div>

      {offers.length === 0 && <Empty text="Aucune offre disponible pour le moment." />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {offers.map(o => {
          const included = o.bricks || []
          const excluded = BRICKS.filter(b => !included.includes(b))
          const isCurrent = o.id === current
          return (
            <div key={o.id} className={`card p-5 flex flex-col ${o.team ? '!border-brand/50' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-lg">{o.name}</h3>
                    {o.team ? <span className="chip bg-brand/10 text-brand"><Users size={12} /> Équipe</span> : <span className="chip bg-surface text-muted"><User size={12} /> Solo</span>}
                  </div>
                  <div className="text-2xl font-extrabold mt-1">{priceOf(o)}</div>
                </div>
                {isCurrent && <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15"><Check size={12} /> Offre actuelle</span>}
              </div>
              {o.desc && <p className="text-sm text-muted mt-2">{o.desc}</p>}

              <div className="mt-3 space-y-1.5 flex-1">
                {included.map(b => (
                  <div key={b} className="flex items-center gap-2 text-sm"><Check size={15} className="text-emerald-500 shrink-0" /> {b}</div>
                ))}
                {o.team && <div className="flex items-center gap-2 text-sm"><Check size={15} className="text-emerald-500 shrink-0" /> Pilotage d'équipe & gestion des comptes</div>}
                {excluded.slice(0, 6).map(b => (
                  <div key={b} className="flex items-center gap-2 text-sm text-muted"><X size={15} className="text-red-400 shrink-0" /> <span className="line-through">{b}</span></div>
                ))}
                {!o.team && <div className="flex items-center gap-2 text-sm text-muted"><X size={15} className="text-red-400 shrink-0" /> <span className="line-through">Pilotage d'équipe & comptes multiples</span></div>}
              </div>

              <button className={`btn-${isCurrent ? 'ghost' : 'primary'} w-full justify-center mt-4`} disabled={isCurrent}
                onClick={() => setConfirm(o)}>
                {isCurrent ? 'Votre offre actuelle' : <>Souscrire à {o.name} <ArrowRight size={15} /></>}
              </button>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-muted flex items-center gap-1.5"><Sparkles size={13} className="text-brand" /> Les offres et leurs conditions sont susceptibles d'évoluer — cette page reflète toujours les offres disponibles en temps réel.</p>

      {confirm && (
        <Confirm yesLabel="Envoyer la demande"
          message={`Souscrire à l'offre « ${confirm.name} » ? Une demande sera ouverte au support BD Report, qui activera votre accès.`}
          onYes={() => { store.subscribeToOffer(confirm.id); setConfirm(null); toast('Demande envoyée au support ✓'); window.dispatchEvent(new CustomEvent('app-navigate', { detail: 'support' })) }}
          onNo={() => setConfirm(null)} />
      )}
    </div>
  )
}
