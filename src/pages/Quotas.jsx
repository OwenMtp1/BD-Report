import React, { useMemo, useState } from 'react'
import { Target, TrendingUp, Save, Info, RotateCcw } from 'lucide-react'
import {
  useStore, QUOTA_METRICS, ACTIVITY_PERIODS, memberQuota, quotaAchieved, rampFactor,
  fmtMoney, todayISO,
} from '../store.jsx'
import { Field, Empty, toast } from '../ui.jsx'

// « Objectifs & quotas » — onglet de la console Gestion Manager, module `quotas`.
// Trois questions, dans cet ordre : sur quelle période, sur quoi, et combien par personne.
// Le suivi vient à la fin, une fois les règles posées : un tableau de suivi sans quota
// n'affiche que des colonnes vides.

const fmt = (metricId, v, currency) => (metricId === 'primes' ? fmtMoney(v, currency) : String(v))

function Bar({ pct, ok }) {
  return (
    <div className="h-2 bg-surface rounded-full overflow-hidden min-w-[70px]">
      <div className={`h-full rounded-full transition-all ${ok ? 'bg-emerald-500' : pct >= 60 ? 'bg-brand' : 'bg-amber-500'}`}
        style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}

function Settings({ store, q }) {
  const [ramp, setRamp] = useState((q.ramp || []).join(', '))
  const rampDirty = ramp.trim() !== (q.ramp || []).join(', ')
  const parseRamp = () => ramp.split(',').map(v => Number(v.trim())).filter(v => !isNaN(v) && v > 0)

  return (
    <div className="card p-4 space-y-4">
      <div>
        <h3 className="font-bold flex items-center gap-2"><Target size={17} className="text-brand" /> Règles communes</h3>
        <p className="text-xs text-muted mt-0.5">Ce que l'équipe suit, sur quelle période, et comment un arrivant y accède progressivement.</p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <Field label="Période de référence">
          <select className="input !w-auto" value={q.period} onChange={e => { store.setQuotas({ period: e.target.value }); toast('Période enregistrée') }}>
            {ACTIVITY_PERIODS.filter(p => p.id !== 'annee').map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Field>
        <div className="min-w-[220px]">
          <div className="text-xs font-semibold text-muted mb-1.5">Indicateurs suivis</div>
          <div className="flex flex-wrap gap-1.5">
            {QUOTA_METRICS.map(m => {
              const on = (q.metrics || []).includes(m.id)
              return (
                <button key={m.id} title={m.hint}
                  className={`chip cursor-pointer ${on ? 'bg-brand text-white' : 'bg-card border border-line text-muted'}`}
                  onClick={() => store.setQuotas({ metrics: on ? q.metrics.filter(x => x !== m.id) : [...(q.metrics || []), m.id] })}>
                  {m.label}
                </button>
              )
            })}
          </div>
          {(q.metrics || []).length === 0 && <p className="text-[11px] text-amber-600 mt-1.5">Aucun indicateur : rien ne sera suivi.</p>}
        </div>
      </div>

      <div className="rounded-xl bg-surface/60 p-3">
        <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5"><TrendingUp size={14} className="text-brand" /> Montée en charge</div>
        <p className="text-[11px] text-muted mb-2">
          Part du quota attendue aux premiers mois, en pourcentage, du 1<sup>er</sup> au dernier palier.
          Elle ne s'applique qu'aux personnes dont vous renseignez la date d'arrivée. Videz le champ pour l'enlever.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input className="input !py-1.5 !w-56 text-sm" value={ramp} placeholder="40, 70, 100"
            onChange={e => setRamp(e.target.value)} />
          <span className="text-[11px] text-muted">
            {parseRamp().length
              ? parseRamp().map((v, i) => `mois ${i + 1} : ${v} %`).join(' · ')
              : 'aucune montée en charge'}
          </span>
          {rampDirty && (
            <button className="btn-primary !py-1 text-xs" onClick={() => { store.setQuotas({ ramp: parseRamp() }); toast('Montée en charge enregistrée') }}>
              <Save size={13} /> Enregistrer
            </button>
          )}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-muted mb-1.5">Quota par défaut, par personne et par {ACTIVITY_PERIODS.find(p => p.id === q.period)?.label.toLowerCase()}</div>
        <div className="flex flex-wrap gap-3">
          {QUOTA_METRICS.filter(m => (q.metrics || []).includes(m.id)).map(m => (
            <label key={m.id} className="text-[11px] text-muted">
              {m.label}
              <input type="number" min="0" className="input !py-1 !w-24 mt-0.5" value={q.defaults?.[m.id] ?? 0}
                onChange={e => store.setQuotas({ defaults: { ...q.defaults, [m.id]: Number(e.target.value) || 0 } })} />
            </label>
          ))}
        </div>
        <p className="text-[11px] text-muted mt-1.5">Il s'applique à toute personne pour laquelle vous ne fixez pas de cible propre.</p>
      </div>
    </div>
  )
}

export default function Quotas() {
  const store = useStore()
  const q = store.quotas()
  const canEdit = store.canSetQuotas()
  const envId = store.session?.envId
  const subs = useMemo(() => store.db.subenvs.filter(s => s.envId === envId), [store.db.subenvs, envId])
  const metrics = QUOTA_METRICS.filter(m => (q.metrics || []).includes(m.id))
  const currency = store.sub?.currency || 'EUR'

  if (!canEdit) {
    return <Empty text="Les quotas sont posés par votre manager. Vous retrouvez le vôtre sur votre tableau de bord." />
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-extrabold flex items-center gap-2"><Target size={18} className="text-brand" /> Objectifs & quotas</h3>
        <p className="text-xs text-muted mt-0.5">
          Un quota posé par le manager, par personne et par période — et une montée en charge pour
          que les arrivées récentes ne soient pas rouges partout dès le premier mois.
        </p>
      </div>

      <Settings store={store} q={q} />

      {subs.length === 0 ? <Empty text="Aucun espace collaborateur dans cet environnement." /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-xs text-muted uppercase tracking-wide">
                <th className="py-2.5 pl-3">Collaborateur</th>
                <th>Arrivée</th>
                {metrics.map(m => <th key={m.id} className="text-center">{m.label}</th>)}
                <th className="pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {subs.map(s => {
                const m = q.byMember?.[s.id] || {}
                const factor = rampFactor(q, m.startDate)
                return (
                  <tr key={s.id} className="border-t border-line">
                    <td className="py-2 pl-3">
                      <div className="font-semibold">{s.prenom} {s.nom}</div>
                      <div className="text-[11px] text-muted">{s.poste}</div>
                    </td>
                    <td>
                      <input type="date" className="input !py-1 !w-36 text-xs" value={m.startDate || ''}
                        onChange={e => store.setMemberQuota(s.id, { startDate: e.target.value })} />
                      {factor < 1 && (
                        <div className="text-[11px] text-amber-600 mt-0.5">montée en charge · {Math.round(factor * 100)} %</div>
                      )}
                    </td>
                    {metrics.map(mt => {
                      const eff = memberQuota(store.db.environments.find(e => e.id === envId), s.id, mt.id)
                      return (
                        <td key={mt.id} className="text-center">
                          <input type="number" min="0" className="input !py-1 !w-20 text-center"
                            placeholder={String(q.defaults?.[mt.id] ?? 0)}
                            value={m.targets?.[mt.id] ?? ''}
                            onChange={e => store.setMemberQuota(s.id, { targets: { ...(m.targets || {}), [mt.id]: e.target.value === '' ? '' : Number(e.target.value) } })} />
                          {eff.ramping && <div className="text-[11px] text-amber-600">→ {fmt(mt.id, eff.target, currency)}</div>}
                        </td>
                      )
                    })}
                    <td className="pr-3">
                      {(m.startDate || Object.keys(m.targets || {}).length > 0) && (
                        <button className="btn-ghost !p-1.5" title="Revenir au quota par défaut"
                          onClick={() => { store.setMemberQuota(s.id, { targets: {}, startDate: '' }); toast('Quota remis par défaut') }}>
                          <RotateCcw size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="text-[11px] text-muted px-3 pb-3">Une case vide reprend le quota par défaut. La flèche indique la cible réellement attendue après montée en charge.</p>
        </div>
      )}

      {metrics.length > 0 && subs.length > 0 && (
        <div className="card p-4">
          <h3 className="font-bold mb-3 flex items-center gap-2"><TrendingUp size={16} className="text-brand" /> Où en est l'équipe, {ACTIVITY_PERIODS.find(p => p.id === q.period)?.label.toLowerCase()} en cours</h3>
          <div className="space-y-3">
            {subs.map(s => {
              const data = store.db.data[s.id]
              if (!data) return null
              return (
                <div key={s.id} className="rounded-xl border border-line p-3">
                  <div className="font-semibold text-sm mb-2">{s.prenom} {s.nom}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {metrics.map(mt => {
                      const eff = memberQuota(store.db.environments.find(e => e.id === envId), s.id, mt.id)
                      const done = quotaAchieved(data, mt.id, eff.period, new Date(), { env: store.db.environments.find(e => e.id === envId), subId: s.id })
                      const pct = eff.target ? Math.round((done / eff.target) * 100) : 0
                      return (
                        <div key={mt.id}>
                          <div className="flex items-center justify-between text-[11px] font-semibold mb-1">
                            <span className="text-muted">{mt.label}</span>
                            <span className={pct >= 100 ? 'text-emerald-600' : ''}>
                              {fmt(mt.id, done, currency)}{eff.target ? ` / ${fmt(mt.id, eff.target, currency)}` : ''}
                            </span>
                          </div>
                          <Bar pct={pct} ok={pct >= 100} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-[11px] text-muted mt-3 flex items-center gap-1.5">
            <Info size={12} /> Le réalisé se lit sur la période de chacun : une personne peut être suivie au mois quand le reste de l'équipe l'est à la semaine.
          </p>
        </div>
      )}
    </div>
  )
}
