import React, { useMemo, useState } from 'react'
import {
  LayoutDashboard, Users2, TrendingDown, LifeBuoy, Timer, CheckCircle2,
  Star, FolderKanban, AlertTriangle, Heart, ShieldAlert,
} from 'lucide-react'
import {
  useStore, CLIENT_STATUSES, PROJECT_STATUSES, TICKET_PRIORITIES,
  firstResponseMs, slaInfo, fmtDuration, fmtDate,
} from '../store.jsx'
import { Empty, Modal } from '../ui.jsx'

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0)
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)

// Carte d'indicateur. `tone` colore la valeur quand elle porte un jugement.
function Kpi({ icon: Icon, label, value, hint, tone = '', onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={`card p-3.5 text-left w-full ${onClick ? 'hover:border-brand transition' : ''}`}>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted">
        <Icon size={13} className="shrink-0" /> <span className="truncate">{label}</span>
      </div>
      <div className={`text-2xl font-extrabold mt-1 ${tone}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted mt-0.5">{hint}</div>}
      {onClick && <div className="text-[10px] text-brand font-semibold mt-1">Détail →</div>}
    </Tag>
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
  const ratings = store.db.productRatings || []

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
    // Deux satisfactions distinctes : la prise en charge d'une demande, et l'attachement
    // au produit. Les confondre masquerait un support irréprochable sur un produit qu'on
    // s'apprête à quitter — ou l'inverse.
    const productScores = ratings.map(r => r.score).filter(v => typeof v === 'number')

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

    // Client à risque : un signal isolé ne veut rien dire. On croise l'insatisfaction
    // exprimée (toutes notes confondues) avec la charge de demandes en cours, et on
    // conserve les faits qui ont motivé le classement plutôt qu'un score opaque.
    const risks = clients.map(c => {
      const its = tickets.filter(t => t.envId === c.envId || t.clientName === c.name)
      const lowTickets = its.filter(t => typeof t.csat?.score === 'number' && t.csat.score < 3)
      const lowProduct = ratings.filter(r => r.envId === c.envId && r.score < 3)
      const openIts = its.filter(t => t.status !== 'closed')
      const breached = openIts.filter(t => slaInfo(t).breached)
      const lost = projects.filter(p => p.status === 'termine' && p.closeReason && (p.clientName === c.name || p.envId === c.envId))
      const signals = []
      lowTickets.forEach(t => signals.push({ kind: 'Note support', when: t.csat.ts || t.closedAt || t.createdAt, text: `${t.csat.score}/5 sur « ${t.category} »${t.csat.comment ? ` — « ${t.csat.comment} »` : ''}` }))
      lowProduct.forEach(r => signals.push({ kind: 'Note produit', when: r.ts, text: `${r.score}/5 par ${r.accountName || 'un utilisateur'}${r.comment ? ` — « ${r.comment} »` : ''}` }))
      openIts.forEach(t => signals.push({ kind: 'Ticket ouvert', when: t.createdAt, text: `${t.category}${slaInfo(t).breached ? ' — SLA dépassé' : ''}` }))
      lost.forEach(p => signals.push({ kind: 'Projet clôturé', when: p.closedAt, text: `${p.name} — ${p.closeReason}` }))
      // Le score pèse l'insatisfaction plus lourd que le volume : trois tickets ouverts
      // chez un client satisfait n'ont pas la même valeur qu'une note de 1/5.
      const score = lowTickets.length * 3 + lowProduct.length * 3 + breached.length * 2 + Math.min(openIts.length, 5)
      return {
        id: c.id, name: c.name, score,
        lowCount: lowTickets.length + lowProduct.length, openCount: openIts.length, breached: breached.length,
        signals: signals.sort((a, b) => new Date(b.when || 0) - new Date(a.when || 0)),
      }
    }).filter(r => r.score >= 3).sort((a, b) => b.score - a.score)

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
      product: avg(productScores), productCount: productScores.length,
      reasons, categories, closedProjects,
      supportDetail: tickets.filter(t => t.csat).sort((a, b) => (a.csat.score - b.csat.score)),
      productDetail: [...ratings].sort((a, b) => a.score - b.score),
      risks,
    }
  }, [clients, tickets, projects, ratings])

  const [detail, setDetail] = useState('')
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
        <Kpi icon={Star} label="Satisfaction support" value={m.csat == null ? '—' : `${m.csat.toFixed(1)}/5`}
          tone={m.csat == null ? '' : m.csat >= 4 ? 'text-emerald-600' : m.csat >= 3 ? 'text-amber-600' : 'text-red-600'}
          hint={m.csatCount ? `${m.csatCount} avis sur la prise en charge` : 'Aucun avis'}
          onClick={m.csatCount ? () => setDetail('support') : undefined} />
        <Kpi icon={Heart} label="Fidélisation produit" value={m.product == null ? '—' : `${m.product.toFixed(1)}/5`}
          tone={m.product == null ? '' : m.product >= 4 ? 'text-emerald-600' : m.product >= 3 ? 'text-amber-600' : 'text-red-600'}
          hint={m.productCount ? `${m.productCount} note${m.productCount > 1 ? 's' : ''} sur le produit` : 'Aucune note'}
          onClick={m.productCount ? () => setDetail('product') : undefined} />
        <Kpi icon={ShieldAlert} label="Clients à risque" value={m.risks.length}
          tone={m.risks.length ? 'text-red-600' : 'text-emerald-600'}
          hint={m.risks.length ? 'Insatisfaction croisée aux demandes en cours' : 'Aucun signal préoccupant'}
          onClick={m.risks.length ? () => setDetail('risk') : undefined} />
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

      {detail && (
        <Modal wide title={
          detail === 'support' ? 'Satisfaction sur la prise en charge'
            : detail === 'product' ? 'Fidélisation produit'
              : 'Clients à risque'
        } onClose={() => setDetail('')}>
          {detail === 'support' && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted">Notes laissées à la clôture d'un ticket, des plus basses aux plus hautes.</p>
              {m.supportDetail.map(t => (
                <div key={t.id} className="p-2.5 rounded-lg bg-surface">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold truncate">{t.category}</span>
                    <span className={`chip shrink-0 ${t.csat.score < 3 ? 'bg-red-100 text-red-700' : t.csat.score < 4 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {t.csat.score}/5
                    </span>
                  </div>
                  <div className="text-[11px] text-muted">{t.clientName} · {fmtDate((t.closedAt || t.createdAt).slice(0, 10))}</div>
                  {t.csat.comment && <p className="text-xs text-muted italic mt-1">« {t.csat.comment} »</p>}
                </div>
              ))}
            </div>
          )}

          {detail === 'product' && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted">Notes données spontanément sur le produit, aux jalons d'usage.</p>
              {m.productDetail.map(r => (
                <div key={r.id} className="p-2.5 rounded-lg bg-surface">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold truncate">{r.accountName || 'Utilisateur'}</span>
                    <span className={`chip shrink-0 ${r.score < 3 ? 'bg-red-100 text-red-700' : r.score < 4 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {r.score}/5
                    </span>
                  </div>
                  <div className="text-[11px] text-muted">après {r.milestone} jours · {fmtDate((r.ts || '').slice(0, 10))}</div>
                  {r.comment && <p className="text-xs text-muted italic mt-1">« {r.comment} »</p>}
                </div>
              ))}
            </div>
          )}

          {detail === 'risk' && (
            <div className="space-y-3">
              <p className="text-xs text-muted">
                Un signal isolé ne dit rien : le classement croise les notes inférieures à 3/5, tous canaux
                confondus, avec les demandes en cours et les dépassements de délai. Les faits retenus sont listés.
              </p>
              {m.risks.map(r => (
                <div key={r.id} className="rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-bold text-sm">{r.name}</span>
                    <div className="flex gap-1.5 flex-wrap">
                      {r.lowCount > 0 && <span className="chip bg-red-100 text-red-700">{r.lowCount} note{r.lowCount > 1 ? 's' : ''} &lt; 3/5</span>}
                      {r.openCount > 0 && <span className="chip bg-amber-100 text-amber-700">{r.openCount} ticket{r.openCount > 1 ? 's' : ''} ouvert{r.openCount > 1 ? 's' : ''}</span>}
                      {r.breached > 0 && <span className="chip bg-red-100 text-red-700">{r.breached} hors délai</span>}
                    </div>
                  </div>
                  <div className="mt-2 space-y-1">
                    {r.signals.map((sig, i) => (
                      <div key={i} className="text-xs flex gap-2">
                        <span className="chip bg-surface text-muted shrink-0">{sig.kind}</span>
                        <span className="text-muted flex-1">{sig.text}</span>
                        {sig.when && <span className="text-muted shrink-0">{fmtDate(String(sig.when).slice(0, 10))}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
