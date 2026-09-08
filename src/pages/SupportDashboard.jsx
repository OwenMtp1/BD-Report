import React, { useMemo } from 'react'
import {
  LayoutDashboard, Users2, TrendingDown, LifeBuoy, Timer, CheckCircle2,
  Star, FolderKanban, AlertTriangle,
} from 'lucide-react'
import {
  useStore, CLIENT_STATUSES, PROJECT_STATUSES, TICKET_PRIORITIES,
  firstResponseMs, slaInfo, fmtDuration, fmtDate,
} from '../store.jsx'
import { Empty } from '../ui.jsx'

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0)
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)

// Carte d'indicateur. `tone` colore la valeur quand elle porte un jugement.
function Kpi({ icon: Icon, label, value, hint, tone = '' }) {
  return (
    <div className="card p-3.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted">
        <Icon size={13} className="shrink-0" /> <span className="truncate">{label}</span>
      </div>
      <div className={`text-2xl font-extrabold mt-1 ${tone}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted mt-0.5">{hint}</div>}
    </div>
  )
}

// Répartition en barres : lisible sans dépendance graphique, et sûre à imprimer.
function Bars({ rows, total, empty = 'Aucune donnée.' }) {
  if (!rows.length || !total) return <p className="text-xs text-muted">{empty}</p>
  return (
    <div className="space-y-1.5">
      {rows.map(r => (
        <div key={r.key}>
          <div className="flex items-center justify-between text-xs mb-0.5">
            <span className="truncate">{r.label}</span>
            <span className="text-muted shrink-0 ml-2">{r.value} · {pct(r.value, total)} %</span>
          </div>
          <div className="h-2 rounded-full bg-surface overflow-hidden">
            <div className={`h-full rounded-full ${r.color || 'bg-brand'}`} style={{ width: `${pct(r.value, total)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function SupportDashboard() {
  const store = useStore()
  const clients = store.db.clients || []
  const tickets = store.db.tickets || []
  const projects = store.db.projects || []

  const m = useMemo(() => {
    const countBy = (id) => clients.filter(c => c.status === id).length
    const actifs = countBy('actifs'), anciens = countBy('anciens'), nonaboutis = countBy('nonaboutis')
    // Le churn rapporte les clients perdus à ceux qui ont réellement été engagés :
    // inclure les demandes en cours diluerait le taux et le rendrait flatteur.
    const engages = actifs + anciens

    const open = tickets.filter(t => t.status !== 'closed')
    const closed = tickets.filter(t => t.status === 'closed')
    const firsts = tickets.map(firstResponseMs).filter(v => v != null)
    const durations = closed
      .filter(t => t.closedAt)
      .map(t => new Date(t.closedAt) - new Date(t.createdAt))
      .filter(v => Number.isFinite(v) && v >= 0)
    const responded = tickets.filter(t => firstResponseMs(t) != null)
    const onTime = responded.filter(t => !slaInfo(t).breached).length
    const breached = tickets.filter(t => slaInfo(t).breached).length
    const scores = tickets.map(t => t.csat?.score).filter(v => typeof v === 'number')

    // Motifs de churn : texte libre, regroupé sur une forme normalisée pour que deux
    // saisies identiques comptent ensemble sans écraser la casse d'origine.
    const closedProjects = projects.filter(p => p.status === 'termine' && String(p.closeReason || '').trim())
    const byReason = new Map()
    closedProjects.forEach(p => {
      const raw = String(p.closeReason).trim()
      const key = raw.toLowerCase().replace(/\s+/g, ' ')
      const cur = byReason.get(key) || { key, label: raw, value: 0, clients: [] }
      cur.value += 1
      if (p.clientName && !cur.clients.includes(p.clientName)) cur.clients.push(p.clientName)
      byReason.set(key, cur)
    })
    const reasons = [...byReason.values()].sort((a, b) => b.value - a.value)

    const catCount = new Map()
    tickets.forEach(t => catCount.set(t.category, (catCount.get(t.category) || 0) + 1))
    const categories = [...catCount.entries()]
      .map(([label, value]) => ({ key: label, label, value }))
      .sort((a, b) => b.value - a.value).slice(0, 6)

    return {
      actifs, anciens, nonaboutis, engages,
      openCount: open.length, closedCount: closed.length,
      avgFirst: avg(firsts), avgResolution: avg(durations),
      slaRate: responded.length ? pct(onTime, responded.length) : null,
      breached, unanswered: open.filter(t => firstResponseMs(t) == null).length,
      csat: avg(scores), csatCount: scores.length,
      reasons, categories, closedProjects,
    }
  }, [clients, tickets, projects])

  const churn = pct(m.anciens, m.engages)
  const partActifs = pct(m.actifs, clients.length)

  const clientRows = CLIENT_STATUSES.map(s => ({
    key: s.id, label: s.label, value: clients.filter(c => c.status === s.id).length,
    color: s.id === 'actifs' ? 'bg-emerald-500' : s.id === 'anciens' ? 'bg-gray-400'
      : s.id === 'nonaboutis' ? 'bg-rose-500' : s.id === 'attente' ? 'bg-blue-500' : 'bg-amber-500',
  }))
  const priorityRows = (TICKET_PRIORITIES || []).map(p => ({
    key: p.id || p, label: p.label || p, value: tickets.filter(t => t.priority === (p.id || p)).length,
  }))
  const projectRows = PROJECT_STATUSES.map(s => ({
    key: s.id, label: s.label, value: projects.filter(p => p.status === s.id).length,
  }))

  if (!clients.length && !tickets.length) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-extrabold flex items-center gap-2">
          <LayoutDashboard size={20} className="text-brand" /> Tableau de bord support
        </h2>
        <Empty text="Rien à mesurer pour l'instant : les indicateurs apparaissent dès les premiers clients et tickets." />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold flex items-center gap-2">
          <LayoutDashboard size={20} className="text-brand" /> Tableau de bord support
        </h2>
        <p className="text-xs text-muted mt-0.5">
          Vue d'ensemble de l'activité support : portefeuille client, churn et traitement des tickets.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Kpi icon={Users2} label="Clients actifs" value={m.actifs}
          hint={`${partActifs} % du portefeuille (${clients.length} clients)`} />
        <Kpi icon={TrendingDown} label="Taux de churn" value={`${churn} %`}
          tone={churn >= 20 ? 'text-red-600' : churn >= 10 ? 'text-amber-600' : 'text-emerald-600'}
          hint={m.engages ? `${m.anciens} perdus sur ${m.engages} engagés` : 'Aucun client engagé'} />
        <Kpi icon={LifeBuoy} label="Tickets ouverts" value={m.openCount}
          tone={m.unanswered > 0 ? 'text-amber-600' : ''}
          hint={m.unanswered > 0 ? `${m.unanswered} sans première réponse` : 'Tous ont reçu une réponse'} />
        <Kpi icon={Timer} label="Résolution moyenne" value={fmtDuration(m.avgResolution)}
          hint={m.closedCount ? `sur ${m.closedCount} ticket${m.closedCount > 1 ? 's' : ''} clos` : 'Aucun ticket clos'} />
        <Kpi icon={Timer} label="1re réponse moyenne" value={fmtDuration(m.avgFirst)}
          hint="Délai entre l'ouverture et la première réponse du support" />
        <Kpi icon={CheckCircle2} label="SLA respecté" value={m.slaRate == null ? '—' : `${m.slaRate} %`}
          tone={m.slaRate == null ? '' : m.slaRate >= 90 ? 'text-emerald-600' : m.slaRate >= 70 ? 'text-amber-600' : 'text-red-600'}
          hint={m.breached ? `${m.breached} hors délai` : 'Aucun dépassement'} />
        <Kpi icon={Star} label="Satisfaction" value={m.csat == null ? '—' : `${m.csat.toFixed(1)}/5`}
          hint={m.csatCount ? `${m.csatCount} avis à la clôture` : 'Aucun avis'} />
        <Kpi icon={FolderKanban} label="Projets en cours" value={projects.filter(p => p.status === 'encours').length}
          hint={`${projects.length} projet${projects.length > 1 ? 's' : ''} au total`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card p-4">
          <h3 className="font-bold text-sm mb-2.5">Portefeuille client</h3>
          <Bars rows={clientRows} total={clients.length} empty="Aucun client enregistré." />
        </div>

        <div className="card p-4">
          <h3 className="font-bold text-sm mb-2.5 flex items-center gap-1.5">
            <TrendingDown size={15} className="text-rose-500" /> Raisons principales de churn
          </h3>
          {m.reasons.length === 0 ? (
            <p className="text-xs text-muted">
              Aucun projet clôturé avec un motif. Le motif est demandé à la fermeture d'un projet et alimente cette liste.
            </p>
          ) : (
            <div className="space-y-2">
              {m.reasons.slice(0, 6).map(r => (
                <div key={r.key} className="p-2 rounded-lg bg-surface">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs whitespace-pre-wrap">{r.label}</p>
                    {r.value > 1 && (
                      <span className="chip bg-rose-100 text-rose-700 shrink-0">×{r.value}</span>
                    )}
                  </div>
                  {r.clients.length > 0 && (
                    <p className="text-[10px] text-muted mt-1 truncate">{r.clients.join(', ')}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-4">
          <h3 className="font-bold text-sm mb-2.5">Tickets par priorité</h3>
          <Bars rows={priorityRows} total={tickets.length} empty="Aucun ticket." />
        </div>

        <div className="card p-4">
          <h3 className="font-bold text-sm mb-2.5">Motifs de contact les plus fréquents</h3>
          <Bars rows={m.categories} total={tickets.length} empty="Aucun ticket." />
        </div>

        <div className="card p-4">
          <h3 className="font-bold text-sm mb-2.5">Projets par statut</h3>
          <Bars rows={projectRows} total={projects.length} empty="Aucun projet." />
        </div>

        <div className="card p-4">
          <h3 className="font-bold text-sm mb-2.5 flex items-center gap-1.5">
            <AlertTriangle size={15} className="text-amber-500" /> Derniers projets clôturés
          </h3>
          {m.closedProjects.length === 0 ? (
            <p className="text-xs text-muted">Aucun projet clôturé.</p>
          ) : (
            <div className="space-y-1.5">
              {m.closedProjects.slice(0, 5).map(p => (
                <div key={p.id} className="flex items-center justify-between gap-2 text-xs p-2 rounded-lg bg-surface">
                  <span className="truncate">{p.name}{p.clientName ? ` — ${p.clientName}` : ''}</span>
                  {p.closedAt && <span className="text-muted shrink-0">{fmtDate(p.closedAt.slice(0, 10))}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
