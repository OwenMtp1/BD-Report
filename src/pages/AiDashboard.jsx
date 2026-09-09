import React, { useState } from 'react'
import { Sparkles, Trash2 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { useStore, computePrimes, primeOpts, uid, parseISO, SOURCES } from '../store.jsx'
import { Empty } from '../ui.jsx'

const COLORS = ['#3b5bdb', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

// Génération "IA" locale : analyse du prompt pour composer des widgets croisés avec les données.
function generateFromPrompt(prompt) {
  const p = prompt.toLowerCase()
  const widgets = []
  const want = (...kw) => kw.some(k => p.includes(k))
  if (want('provenance', 'source', 'canal', 'origine')) widgets.push({ kind: 'pie', dim: 'provenance', title: 'Répartition par provenance' })
  if (want('source', 'inbound', 'outbound')) widgets.push({ kind: 'pie', dim: 'source', title: 'Répartition par source' })
  if (want('phase', 'pipeline', 'transaction')) widgets.push({ kind: 'bar', dim: 'phase', title: 'RDV par phase de transaction' })
  if (want('poste', 'persona', 'fonction')) widgets.push({ kind: 'bar', dim: 'poste', title: 'Contacts par poste' })
  if (want('prime', 'commission', 'revenu', 'argent')) widgets.push({ kind: 'bar', dim: 'primesMois', title: 'Primes par mois de paiement' })
  if (want('mois', 'évolution', 'evolution', 'tendance', 'temps')) widgets.push({ kind: 'bar', dim: 'rdvMois', title: 'RDV réalisés par mois' })
  if (want('secteur', 'industrie')) widgets.push({ kind: 'pie', dim: 'secteur', title: 'Répartition par secteur' })
  if (want('opportunit')) widgets.push({ kind: 'bar', dim: 'opportunite', title: "RDV par statut d'opportunité" })
  if (want('effectif', 'taille', 'collaborateur')) widgets.push({ kind: 'bar', dim: 'effectif', title: "RDV par tranche d'effectif" })
  if (!widgets.length) {
    widgets.push({ kind: 'bar', dim: 'phase', title: 'RDV par phase de transaction' })
    widgets.push({ kind: 'pie', dim: 'provenance', title: 'Répartition par provenance' })
  }
  return widgets
}

function widgetData(w, sub) {
  const count = (fn) => {
    const m = {}
    sub.rdvs.forEach(r => { const k = fn(r); if (k) m[k] = (m[k] || 0) + 1 })
    return Object.entries(m).map(([name, value]) => ({ name, value }))
  }
  switch (w.dim) {
    case 'provenance': return count(r => r.provenance)
    case 'source': return count(r => r.source)
    case 'phase': return count(r => r.phase)
    case 'opportunite': return count(r => r.opportunite)
    case 'secteur': return count(r => r.secteur)
    case 'poste': {
      const m = {}
      sub.rdvs.forEach(r => (r.contacts || []).forEach(c => { if (c.poste) m[c.poste] = (m[c.poste] || 0) + 1 }))
      return Object.entries(m).map(([name, value]) => ({ name, value }))
    }
    case 'effectif': return count(r => {
      const e = Number(r.effectif) || 0
      if (!e) return ''
      if (e <= 50) return '1-50'
      if (e <= 200) return '51-200'
      if (e <= 500) return '201-500'
      return '500+'
    })
    case 'rdvMois': {
      const m = {}
      sub.rdvs.forEach(r => { const d = parseISO(r.dateRdv); if (d) { const k = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }); m[k] = (m[k] || 0) + 1 } })
      return Object.entries(m).map(([name, value]) => ({ name, value }))
    }
    case 'primesMois': {
      const m = {}
      computePrimes(sub.rdvs, sub.bareme, primeOpts(sub)).forEach(p => { m[p.payMonthLabel] = (m[p.payMonthLabel] || 0) + p.montant })
      return Object.entries(m).map(([name, value]) => ({ name, value }))
    }
    default: return []
  }
}

export default function AiDashboard() {
  const store = useStore()
  const sub = store.sub
  const [prompt, setPrompt] = useState('')
  const dashboards = sub.customDashboards || []

  const generate = () => {
    if (!prompt.trim()) return
    const widgets = generateFromPrompt(prompt)
    store.setSub(d => ({ ...d, customDashboards: [...(d.customDashboards || []), { id: uid(), prompt, widgets }] }))
    setPrompt('')
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-extrabold">Dashboard personnalisé</h2>
      <div className="card p-4 space-y-2">
        <div className="flex items-center gap-2 text-brand font-bold text-sm"><Sparkles size={16} /> Générer un dashboard avec un prompt</div>
        <div className="flex gap-2">
          <input className="input" placeholder='Ex : "montre-moi l&apos;évolution de mes primes par mois et la répartition par provenance et par poste"'
            value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => e.key === 'Enter' && generate()} />
          <button className="btn-primary whitespace-nowrap" onClick={generate}><Sparkles size={15} /> Générer</button>
        </div>
      </div>
      {dashboards.length === 0 && <Empty text="Décrivez le dashboard que vous voulez, l'IA le compose à partir de vos données." />}
      {dashboards.map(dash => (
        <div key={dash.id} className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">« {dash.prompt} »</span>
            <button className="p-1.5 rounded-lg hover:bg-surface text-red-500"
              onClick={() => store.setSub(d => ({ ...d, customDashboards: d.customDashboards.filter(x => x.id !== dash.id) }))}><Trash2 size={15} /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dash.widgets.map((w, i) => {
              const data = widgetData(w, sub)
              return (
                <div key={i} className="rounded-xl bg-surface p-3">
                  <div className="text-sm font-bold mb-2">{w.title}</div>
                  <div className="h-52">
                    <ResponsiveContainer>
                      {w.kind === 'pie' ? (
                        <PieChart>
                          <Pie data={data} dataKey="value" nameKey="name" outerRadius={70} label>
                            {data.map((_, j) => <Cell key={j} fill={COLORS[j % COLORS.length]} />)}
                          </Pie>
                          <Legend wrapperStyle={{ fontSize: 11 }} /><Tooltip />
                        </PieChart>
                      ) : (
                        <BarChart data={data} margin={{ left: -25 }}>
                          <XAxis dataKey="name" fontSize={10} /><YAxis fontSize={10} /><Tooltip />
                          <Bar dataKey="value" fill="rgb(var(--brand))" radius={[5, 5, 0, 0]} />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
