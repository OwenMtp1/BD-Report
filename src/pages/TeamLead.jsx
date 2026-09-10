import React, { useMemo, useState } from 'react'
import { TrendingUp, Sun, AlertTriangle, ArrowRightLeft, ShieldCheck, ChevronDown, ChevronRight } from 'lucide-react'
import { useStore, inTimeline, computePrimes, primeOpts, parseISO, fmtDate, monthKey, todayISO, uid, syncContacts, fmtMoney, baremeMatch, phaseProbability, milestonePhase, PHASE_COLORS, phaseColor } from '../store.jsx'
import { Empty, toast, Confirm } from '../ui.jsx'
import { StatementsManager } from './Statements.jsx'
import LandingPanel, { TeamLanding } from './Forecast.jsx'

const dayISO = (offset = 0) => {
  const d = new Date(); d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

// Validation des primes d'un collaborateur (manager) : les primes sont validées
// d'office ; on peut en invalider (retirée des stats du collab + notification).
function MemberPrimes({ m, store }) {
  const [open, setOpen] = useState(false)
  const data = store.db.data[m.id] || { rdvs: [], bareme: [] }
  const primes = computePrimes(data.rdvs || [], data.bareme || [], primeOpts(data)).sort((a, b) => (b.triggerDate || '').localeCompare(a.triggerDate || ''))
  if (!primes.length) return null
  const total = primes.filter(p => !p.invalidated).reduce((a, p) => a + p.montant, 0)
  const nbInval = primes.filter(p => p.invalidated).length
  return (
    <div className="border border-line rounded-xl">
      <button className="w-full flex items-center justify-between gap-2 p-3 text-left" onClick={() => setOpen(o => !o)}>
        <span className="font-semibold text-sm flex items-center gap-1.5">{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />} {m.prenom} {m.nom}</span>
        <span className="text-sm text-muted">{fmtMoney(total)} · {primes.length} prime(s){nbInval ? ` · ${nbInval} invalidée(s)` : ''}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1">
          {primes.map(p => (
            <div key={p.rdvId} className="flex items-center justify-between gap-2 text-sm p-2 rounded-lg bg-surface">
              <div className="min-w-0">
                <div className={`font-semibold truncate ${p.invalidated ? 'line-through text-muted' : ''}`}>{p.entreprise || '—'} — {fmtMoney(p.montant)}</div>
                <div className="text-[11px] text-muted">{p.payMonthLabel}{p.invalidated ? ` · invalidée par ${p.invalidatedBy}` : ''}</div>
              </div>
              {p.invalidated
                ? <button className="btn-ghost !py-1 text-xs shrink-0" onClick={() => store.invalidatePrime(m.id, p.rdvId, false)}>Revalider</button>
                : <button className="btn-ghost !py-1 text-xs shrink-0 !text-red-600" onClick={() => { const reason = window.prompt('Motif de l’invalidation (optionnel) :') ?? ''; store.invalidatePrime(m.id, p.rdvId, true, reason.trim()); toast('Prime invalidée — le collaborateur est notifié') }}>Invalider</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Dernière activité d'un RDV (dernier événement d'historique, sinon prise de RDV)
const lastActivity = (r) => {
  const h = r.history || []
  return (h.length ? h[h.length - 1].date : '') || r.datePriseRdv || r.createdAt || ''
}

function memberStats(data) {
  const rdvs = data.rdvs || []
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dayOfMonth = now.getDate()
  const prisMois = rdvs.filter(r => inTimeline(r.datePriseRdv, 'month')).length
  const sqlMois = rdvs.filter(r => inTimeline(r.datePassageSQL, 'month')).length
  const primes = computePrimes(rdvs, data.bareme, primeOpts(data))
  const primesMois = primes.filter(p => p.payMonthKey === monthKey(new Date(now.getFullYear(), now.getMonth(), 1))).reduce((a, p) => a + p.montant, 0)
  const projection = Math.round((prisMois / Math.max(1, dayOfMonth)) * daysInMonth)
  const lastPrise = rdvs.map(r => r.datePriseRdv).filter(Boolean).sort().pop() || null
  const daysSinceLast = lastPrise ? Math.floor((now - parseISO(lastPrise)) / 86400000) : null
  const noShows = rdvs.filter(r => (r.opportunite || '').startsWith('No Show')).length
  const noShowRate = rdvs.length ? Math.round((noShows / rdvs.length) * 100) : 0
  const dormant = rdvs.filter(r => r.opportunite === 'En cours' && lastActivity(r) < dayISO(-14))
  // Fourchette de primes du mois. Un chiffre unique ne se défend pas en comité : on
  // annonce ce qui est acquis, ce qu'on vise, et le plafond si tout passe.
  //  · basse    = déjà déclenché, plus rien à faire pour l'obtenir
  //  · attendue = acquis + pipeline ouvert pondéré par la probabilité de chaque étape
  //  · haute    = acquis + pipeline ouvert en totalité, sans pondération
  const ouvert = rdvs.filter(r => r.opportunite === 'En cours')
  let attendu = 0, haut = 0
  ouvert.forEach(r => {
    const row = baremeMatch(data.bareme || [], r.effectif, r.source)
    const montant = row ? Number(row.montant) || 0 : 0
    if (!montant) return
    const p = phaseProbability(data, r.phase)
    if (p <= 0 || p >= 1) return // étape perdue, inconnue, ou déjà au jalon (donc acquise)
    attendu += montant * p
    haut += montant
  })
  const forecast = {
    basse: primesMois,
    attendue: primesMois + Math.round(attendu),
    haute: primesMois + haut,
    ouvertes: ouvert.length,
  }
  return {
    prisMois, sqlMois, primesMois, projection, forecast,
    goals: data.goals || {}, daysSinceLast, noShowRate, dormant,
    hier: rdvs.filter(r => r.dateRdv === dayISO(-1)),
    aujourdhui: rdvs.filter(r => r.dateRdv === dayISO(0)),
    sqlSemaine: rdvs.filter(r => inTimeline(r.datePassageSQL, 'week')).length,
  }
}

// Carte des territoires. Portée par l'environnement : une carte que chacun verrait
// différemment ne serait pas une carte.
function Territories({ store, members }) {
  const list = store.territories()
  const [editing, setEditing] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const blank = () => ({ id: uid(), name: '', ownerSubId: members[0]?.id || '', companies: [], sectors: [] })
  const nameOf = (id) => { const m = members.find(x => x.id === id); return m ? `${m.prenom} ${m.nom}` : '—' }
  // Saisie en texte libre, une entrée par ligne : plus rapide qu'un formulaire à puces pour
  // coller une liste de comptes venue d'ailleurs.
  const toList = (txt) => txt.split('\n').map(s => s.trim()).filter(Boolean)

  return (
    <div className="card p-4">
      <h3 className="font-bold mb-1">Territoires & attribution</h3>
      <p className="text-xs text-muted mb-3">
        À qui revient quel compte, quel secteur. L'alerte apparaît dans le formulaire de RDV,
        <b> avant</b> le premier appel — l'alerte de doublon existante, elle, ne se déclenche
        qu'une fois que deux personnes ont travaillé la même entreprise.
      </p>

      {list.length === 0 && <Empty text="Aucun territoire défini — tous les comptes sont ouverts à tout le monde." />}
      <div className="space-y-1.5">
        {list.map(t => (
          <div key={t.id} className="flex items-center gap-2 p-2 rounded-xl border border-line">
            <span className="font-semibold text-sm flex-1">{t.name}</span>
            <span className="text-[11px] text-muted">{nameOf(t.ownerSubId)}</span>
            <span className="text-[11px] text-muted">
              {(t.companies || []).length} compte(s) · {(t.sectors || []).length} secteur(s)
            </span>
            <button className="btn-ghost !p-1" title="Modifier" onClick={() => setEditing(JSON.parse(JSON.stringify(t)))}>✎</button>
            <button className="btn-ghost !p-1 !text-red-500" title="Supprimer" onClick={() => setConfirmDel(t)}>✕</button>
          </div>
        ))}
      </div>
      <button className="btn-ghost !py-1.5 text-sm mt-2" onClick={() => setEditing(blank())}>+ Nouveau territoire</button>

      {editing && (
        <div className="mt-3 rounded-xl border border-line p-3 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className="text-xs">
              <span className="block text-muted mb-1">Nom du territoire</span>
              <input className="input" value={editing.name} placeholder="ex : Grands comptes Île-de-France"
                onChange={e => setEditing(t => ({ ...t, name: e.target.value }))} />
            </label>
            <label className="text-xs">
              <span className="block text-muted mb-1">Attribué à</span>
              <select className="input" value={editing.ownerSubId} onChange={e => setEditing(t => ({ ...t, ownerSubId: e.target.value }))}>
                {members.map(m => <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>)}
              </select>
            </label>
            <label className="text-xs">
              <span className="block text-muted mb-1">Comptes nommés (un par ligne)</span>
              <textarea className="input h-24" value={(editing.companies || []).join('\n')}
                onChange={e => setEditing(t => ({ ...t, companies: toList(e.target.value) }))} />
            </label>
            <label className="text-xs">
              <span className="block text-muted mb-1">Secteurs (un par ligne)</span>
              <textarea className="input h-24" value={(editing.sectors || []).join('\n')}
                onChange={e => setEditing(t => ({ ...t, sectors: toList(e.target.value) }))} />
            </label>
          </div>
          <p className="text-[11px] text-muted">
            Un compte nommé l'emporte sur un secteur : une exception nominative existe
            précisément pour déroger à la règle générale.
          </p>
          <div className="flex gap-2">
            <button className="btn-primary !py-1.5 text-sm" disabled={!editing.name.trim() || !editing.ownerSubId}
              onClick={() => { store.saveTerritory(editing); setEditing(null); toast('Territoire enregistré') }}>Enregistrer</button>
            <button className="btn-ghost !py-1.5 text-sm" onClick={() => setEditing(null)}>Annuler</button>
          </div>
        </div>
      )}

      {confirmDel && (
        <Confirm message={`Supprimer le territoire « ${confirmDel.name} » ? Les comptes qu'il couvrait redeviennent ouverts à tout le monde.`}
          onYes={() => { store.deleteTerritory(confirmDel.id); setConfirmDel(null); toast('Territoire supprimé') }}
          onNo={() => setConfirmDel(null)} />
      )}
    </div>
  )
}

export default function TeamLead() {
  const store = useStore()
  const envId = store.session.envId
  const members = store.db.subenvs.filter(s => s.envId === envId)
  const stats = useMemo(() => members.map(m => ({ m, s: memberStats(store.db.data[m.id] || { rdvs: [], bareme: [] }) })), [store.db, envId])
  const forecastSubs = useMemo(() => members.map(m => ({ id: m.id, data: store.db.data[m.id] })), [store.db, envId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Réassignation
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [picked, setPicked] = useState(new Set())
  const fromRdvs = (store.db.data[fromId]?.rdvs || []).filter(r => !r.parentId)

  const transfer = () => {
    if (!fromId || !toId || fromId === toId || picked.size === 0) return
    const fromName = members.find(m => m.id === fromId)
    const toName = members.find(m => m.id === toId)
    store.setDb(d => {
      const src = d.data[fromId], dst = d.data[toId]
      const moving = src.rdvs.filter(r => picked.has(r.id) || picked.has(r.parentId))
      src.rdvs = src.rdvs.filter(r => !picked.has(r.id) && !picked.has(r.parentId))
      moving.forEach(r => { dst.rdvs.push(r); syncContacts(dst, r) })
      const log = (data, action) => {
        data.logs = data.logs || []
        data.logs.unshift({ id: uid(), ts: new Date().toISOString(), type: 'Lead', action, details: `${moving.length} RDV — ${fromName?.prenom} → ${toName?.prenom}` })
      }
      log(src, 'Leads réassignés (sortants)')
      log(dst, 'Leads réassignés (entrants)')
      return d
    })
    toast(`${picked.size} lead(s) transféré(s) de ${fromName?.prenom} vers ${toName?.prenom}`)
    setPicked(new Set())
  }

  // ---- Totaux équipe
  const team = stats.reduce((a, { s }) => ({
    pris: a.pris + s.prisMois, sql: a.sql + s.sqlMois, primes: a.primes + s.primesMois,
    proj: a.proj + s.projection, goalPris: a.goalPris + 4 * (Number(s.goals.rdvSemaine) || 0), goalSql: a.goalSql + (Number(s.goals.sqlMois) || 0),
    fBasse: a.fBasse + s.forecast.basse, fAttendue: a.fAttendue + s.forecast.attendue,
    fHaute: a.fHaute + s.forecast.haute, fOuvertes: a.fOuvertes + s.forecast.ouvertes,
    goalPrimes: a.goalPrimes + (Number(s.goals.primesMois) || 0),
  }), { pris: 0, sql: 0, primes: 0, proj: 0, goalPris: 0, goalSql: 0, fBasse: 0, fAttendue: 0, fHaute: 0, fOuvertes: 0, goalPrimes: 0 })

  // ---- Alertes de dérive
  const alerts = []
  stats.forEach(({ m, s }) => {
    const name = `${m.prenom} ${m.nom}`
    if (s.daysSinceLast === null) alerts.push({ name, text: 'aucun RDV enregistré pour le moment' })
    else if (s.daysSinceLast >= 5) alerts.push({ name, text: `aucun RDV pris depuis ${s.daysSinceLast} jours` })
    if (s.noShowRate >= 30) alerts.push({ name, text: `taux de no-show élevé : ${s.noShowRate} %` })
    if (s.dormant.length >= 3) alerts.push({ name, text: `${s.dormant.length} leads en cours sans activité depuis 14 jours` })
  })

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-extrabold">Pilotage équipe <span className="text-sm text-muted font-semibold">({members.length} espaces)</span></h2>

      {/* Alertes de dérive */}
      {alerts.length > 0 && (
        <div className="card p-4 border-amber-300 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/5">
          <h3 className="font-bold mb-2 flex items-center gap-2 text-amber-700 dark:text-amber-300"><AlertTriangle size={17} /> Points d'attention</h3>
          <ul className="space-y-1 text-sm">
            {alerts.map((a, i) => <li key={i}><b>{a.name}</b> — {a.text}</li>)}
          </ul>
        </div>
      )}

      {/* Où l'équipe arrive si le rythme se maintient. Placé haut : c'est la question du
          milieu de période, avant même de savoir qui est en avance sur qui. */}
      {store.hasModule('forecast') && (
        <div className="card p-4">
          <h3 className="font-bold mb-1">Atterrissage de l'équipe</h3>
          <p className="text-xs text-muted mb-3">
            Somme des trajectoires individuelles. La fourchette encadre deux rythmes : depuis le
            début de période, et sur les derniers jours.
          </p>
          <TeamLanding subs={forecastSubs} />
          <div className="mt-3 space-y-1.5">
            {members.map(m => (
              <details key={m.id} className="rounded-xl border border-line">
                <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">{m.prenom} {m.nom}</summary>
                <div className="px-3 pb-3">
                  <LandingPanel data={store.db.data[m.id]} subId={m.id} title="" compact />
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      {store.hasModule('territories') && <Territories store={store} members={members} />}

      {/* Fourchette de primes du mois — le chiffre qu'on présente en comité */}
      <div className="card p-4">
        <h3 className="font-bold mb-1 flex items-center gap-2"><TrendingUp size={17} className="text-brand" /> Primes du mois — fourchette</h3>
        <p className="text-xs text-muted mb-3">
          {team.fOuvertes} opportunité{team.fOuvertes > 1 ? 's' : ''} encore ouverte{team.fOuvertes > 1 ? 's' : ''}.
          L'attendu pondère chaque affaire par sa probabilité d'atteindre {milestonePhase(store.sub)} ; le haut suppose qu'elles passent toutes.
        </p>
        {/* Un prévisionnel ne peut pas appliquer un seuil ou un accélérateur : ils dépendent de
            l'atteinte du quota en FIN de mois, qu'on ne connaît pas encore. On le dit plutôt
            que de laisser croire que ces montants sont ceux qui seront versés. */}
        {store.sub?.primeRules?.on && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-3 -mt-2">
            Montants au barème, avant seuils, accélérateurs et plafonds : ils dépendent de l'atteinte
            du quota en fin de mois. Le net figure sur le relevé de chacun.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            ['Acquis', team.fBasse, 'Déjà déclenché — plus rien à faire pour l\'obtenir.', 'text-emerald-600'],
            ['Attendu', team.fAttendue, 'Acquis + pipeline ouvert pondéré. Le chiffre à annoncer.', 'text-brand'],
            ['Haut', team.fHaute, 'Si toutes les affaires ouvertes passent. Le plafond, pas la prévision.', 'text-muted'],
          ].map(([label, val, hint, cls]) => (
            <div key={label} className="rounded-xl bg-surface p-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</div>
              <div className={`text-2xl font-extrabold ${cls}`}>{fmtMoney(val)}</div>
              <p className="text-[11px] text-muted mt-1">{hint}</p>
            </div>
          ))}
        </div>
        {/* Une barre qui montre où se situe l'acquis dans la fourchette : c'est la
            distance à parcourir qui se discute en comité, pas le total. */}
        {team.fHaute > 0 && (
          <div className="mt-3">
            <div className="h-2.5 rounded-full bg-surface overflow-hidden flex">
              <div className="bg-emerald-500" style={{ width: `${(team.fBasse / team.fHaute) * 100}%` }} title="Acquis" />
              <div className="bg-brand/50" style={{ width: `${((team.fAttendue - team.fBasse) / team.fHaute) * 100}%` }} title="Attendu en plus" />
            </div>
            {team.goalPrimes > 0 && (
              <p className="text-[11px] text-muted mt-1.5">
                Objectif équipe {fmtMoney(team.goalPrimes)} —{' '}
                {team.fAttendue >= team.goalPrimes
                  ? <span className="text-emerald-600 font-semibold">atteint dans le scénario attendu.</span>
                  : <span className="text-amber-600 font-semibold">il manque {fmtMoney(team.goalPrimes - team.fAttendue)} au scénario attendu.</span>}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Forecast d'équipe */}
      <div className="card p-4 overflow-x-auto">
        <h3 className="font-bold mb-1 flex items-center gap-2"><TrendingUp size={17} className="text-brand" /> Forecast du mois</h3>
        <p className="text-xs text-muted mb-3">Projection de fin de mois au rythme actuel. Objectif RDV mensuel = objectif hebdo × 4.</p>
        <table className="w-full text-sm min-w-[700px]">
          <thead><tr className="text-left text-xs text-muted uppercase">
            <th className="py-2">BDR</th><th>RDV pris</th><th>Projection</th><th>SQL</th><th>Primes</th><th>Statut</th>
          </tr></thead>
          <tbody>
            {stats.map(({ m, s }) => {
              const goalMois = 4 * (Number(s.goals.rdvSemaine) || 0)
              const onTrack = goalMois ? s.projection >= goalMois : null
              return (
                <tr key={m.id} className="border-t border-line">
                  <td className="py-2 font-semibold">{m.prenom} {m.nom} <span className="text-xs text-muted font-normal">({m.poste})</span></td>
                  <td>{s.prisMois}{goalMois ? <span className="text-xs text-muted"> / {goalMois}</span> : ''}</td>
                  <td className="font-bold">{s.projection}</td>
                  <td>{s.sqlMois}{s.goals.sqlMois ? <span className="text-xs text-muted"> / {s.goals.sqlMois}</span> : ''}</td>
                  <td>{fmtMoney(s.primesMois)}</td>
                  <td>{onTrack === null ? <span className="chip bg-surface text-muted">pas d'objectif</span>
                    : onTrack ? <span className="chip bg-emerald-100 text-emerald-700">✓ en bonne voie</span>
                    : <span className="chip bg-red-100 text-red-700">⚠ en retard</span>}</td>
                </tr>
              )
            })}
            <tr className="border-t-2 border-line font-extrabold">
              <td className="py-2">Équipe</td>
              <td>{team.pris}{team.goalPris ? <span className="text-xs text-muted font-normal"> / {team.goalPris}</span> : ''}</td>
              <td>{team.proj}</td>
              <td>{team.sql}{team.goalSql ? <span className="text-xs text-muted font-normal"> / {team.goalSql}</span> : ''}</td>
              <td>{fmtMoney(team.primes)}</td>
              <td>{team.goalPris ? (team.proj >= team.goalPris
                ? <span className="chip bg-emerald-100 text-emerald-700">✓ quota atteignable</span>
                : <span className="chip bg-red-100 text-red-700">⚠ {Math.max(0, team.goalPris - team.proj)} RDV manquants</span>) : null}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Relevés mensuels : le document que le collaborateur pourra opposer, une fois signé. */}
      {store.hasModule('statements') && <StatementsManager />}

      {/* Validation des primes (manager) */}
      <div className="card p-4">
        <h3 className="font-bold mb-1 flex items-center gap-2"><ShieldCheck size={17} className="text-emerald-600" /> Validation des primes</h3>
        <p className="text-xs text-muted mb-3">Les primes sont validées d'office. Invalidez celles qui ne doivent pas être payées : elles sortent des statistiques du collaborateur, qui reçoit une notification.</p>
        <div className="space-y-2">
          {stats.map(({ m }) => <MemberPrimes key={m.id} m={m} store={store} />)}
        </div>
      </div>

      {/* Daily standup */}
      <div className="card p-4">
        <h3 className="font-bold mb-1 flex items-center gap-2"><Sun size={17} className="text-amber-500" /> Daily Standup</h3>
        <p className="text-xs text-muted mb-3">La lecture de 30 secondes pour animer le stand-up du matin.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {stats.map(({ m, s }) => (
            <div key={m.id} className="rounded-xl bg-surface p-3">
              <div className="font-bold text-sm mb-1.5">{m.prenom} {m.nom}</div>
              <div className="text-xs space-y-1">
                <div>📅 Hier : <b>{s.hier.length}</b> RDV {s.hier.length > 0 && <span className="text-muted">({s.hier.map(r => r.entreprise).join(', ')})</span>}</div>
                <div>🎯 Aujourd'hui : <b>{s.aujourdhui.length}</b> RDV {s.aujourdhui.length > 0 && <span className="text-muted">({s.aujourdhui.map(r => r.entreprise).join(', ')})</span>}</div>
                <div>🔥 SQL cette semaine : <b>{s.sqlSemaine}</b></div>
                <div className={s.dormant.length ? 'text-amber-700' : 'text-muted'}>💤 Leads dormants (14 j+) : <b>{s.dormant.length}</b>{s.dormant.length > 0 && <span> — {s.dormant.slice(0, 3).map(r => r.entreprise).join(', ')}{s.dormant.length > 3 ? '…' : ''}</span>}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Réassignation de leads */}
      <div className="card p-4">
        <h3 className="font-bold mb-1 flex items-center gap-2"><ArrowRightLeft size={17} className="text-brand" /> Réassigner des leads</h3>
        <p className="text-xs text-muted mb-3">Transférez des RDV (et leurs rendez-vous suivants) d'un espace à un autre — départ, surcharge, redécoupage de territoire. L'opération est tracée dans les logs des deux espaces.</p>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <select className="input !w-auto text-sm" value={fromId} onChange={e => { setFromId(e.target.value); setPicked(new Set()) }}>
            <option value="">Depuis l'espace de…</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>)}
          </select>
          <span className="text-muted">→</span>
          <select className="input !w-auto text-sm" value={toId} onChange={e => setToId(e.target.value)}>
            <option value="">Vers l'espace de…</option>
            {members.filter(m => m.id !== fromId).map(m => <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>)}
          </select>
          <button className="btn-primary text-xs" disabled={!fromId || !toId || picked.size === 0} onClick={transfer}>
            <ArrowRightLeft size={13} /> Transférer {picked.size > 0 ? `(${picked.size})` : ''}
          </button>
        </div>
        {fromId && (fromRdvs.length === 0 ? <Empty text="Aucun rendez-vous dans cet espace." /> : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {fromRdvs.map(r => (
              <label key={r.id} className="flex items-center gap-2 text-sm p-2 rounded-lg hover:bg-surface cursor-pointer">
                <input type="checkbox" checked={picked.has(r.id)}
                  onChange={e => setPicked(p => { const n = new Set(p); e.target.checked ? n.add(r.id) : n.delete(r.id); return n })} />
                <span className={`chip ${phaseColor(r.phase)}`}>{r.phase}</span>
                <span className="font-semibold">{r.entreprise}</span>
                <span className="text-xs text-muted">RDV {fmtDate(r.dateRdv)} · {r.opportunite}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
