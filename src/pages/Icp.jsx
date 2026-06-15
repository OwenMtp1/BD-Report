import React, { useMemo, useState } from 'react'
import { Target, Plus, Trash2, Building2, Users2, Briefcase, Sparkles, Save, CalendarDays } from 'lucide-react'
import { useStore, uid, todayISO, fmtDate } from '../store.jsx'
import { Modal, Field, Empty, Confirm, toast } from '../ui.jsx'

// Rang de progression d'un deal dans le tunnel (R1/R2 = 1, MQL = 2, SQL = 3, Signée = 4, KO = perdu).
const PHASE_RANK = { R1: 1, R2: 1, MQL: 2, SQL: 3, 'Signée': 4 }
function maxRank(rdv) {
  let r = rdv.phase === 'KO' ? 0 : (PHASE_RANK[rdv.phase] || 1)
  ;(rdv.history || []).forEach(h => { if (h.type === 'phase' && PHASE_RANK[h.value]) r = Math.max(r, PHASE_RANK[h.value]) })
  return r
}
const EFF_BANDS = [
  { id: '1-50', label: '1–50', min: 1, max: 50 },
  { id: '51-200', label: '51–200', min: 51, max: 200 },
  { id: '201-500', label: '201–500', min: 201, max: 500 },
  { id: '500+', label: '500 et +', min: 501, max: 1e12 },
]
const bandOf = (eff) => EFF_BANDS.find(b => eff >= b.min && eff <= b.max)
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0)

function statsFor(deals) {
  const total = deals.length
  const mql = deals.filter(d => maxRank(d) >= 2).length
  const sql = deals.filter(d => maxRank(d) >= 3).length
  const signed = deals.filter(d => maxRank(d) >= 4).length
  return { total, mql, sql, signed, r1ToMql: pct(mql, total), mqlToSql: pct(sql, mql), r1ToSql: pct(sql, total), signRate: pct(signed, total) }
}
// Date de référence d'un deal (ouverture) pour le filtrage par période.
const dealDate = (d) => d.datePriseRdv || d.dateRdv || d.createdAt || ''
function matchProfile(deal, p) {
  if (p.secteurs?.length && !p.secteurs.includes(deal.secteur)) return false
  const eff = Number(deal.effectif) || 0
  if (p.effMin != null && eff < p.effMin) return false
  if (p.effMax != null && eff > p.effMax) return false
  if (p.postes?.length) {
    const postes = (deal.contacts || []).map(c => c.poste).filter(Boolean)
    if (!postes.some(po => p.postes.includes(po))) return false
  }
  if (p.dateStart || p.dateEnd) {
    const dd = dealDate(deal)
    if (!dd) return false
    if (p.dateStart && dd < p.dateStart) return false
    if (p.dateEnd && dd > p.dateEnd) return false
  }
  return true
}
const mode = (arr) => {
  const m = {}; arr.forEach(v => { if (v) m[v] = (m[v] || 0) + 1 })
  return Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0] || null
}
const autoName = (p) => {
  const parts = []
  if (p.secteurs?.length) parts.push(p.secteurs.join('/'))
  if (p.effMin != null || p.effMax != null) { const b = EFF_BANDS.find(x => x.min === p.effMin && x.max === p.effMax); parts.push(b ? b.label + ' empl.' : `${p.effMin ?? 0}–${p.effMax ?? '∞'} empl.`) }
  if (p.postes?.length) parts.push(p.postes.join('/'))
  if (p.dateStart || p.dateEnd) parts.push(`${p.dateStart ? fmtDate(p.dateStart) : '…'}→${p.dateEnd ? fmtDate(p.dateEnd) : '…'}`)
  return parts.join(' · ') || 'Tous les deals'
}

function ProfileCard({ profile, deals, global, onSave, onDelete }) {
  const matched = deals.filter(d => matchProfile(d, profile))
  const s = statsFor(matched)
  const delta = s.r1ToSql - global.r1ToSql
  const share = pct(matched.length, global.total)
  const chips = []
  if (profile.secteurs?.length) chips.push({ icon: <Building2 size={11} />, txt: profile.secteurs.join(', ') })
  if (profile.effMin != null || profile.effMax != null) chips.push({ icon: <Users2 size={11} />, txt: (EFF_BANDS.find(b => b.min === profile.effMin && b.max === profile.effMax)?.label || `${profile.effMin ?? 0}–${profile.effMax ?? '∞'}`) + ' empl.' })
  if (profile.postes?.length) chips.push({ icon: <Briefcase size={11} />, txt: profile.postes.join(', ') })
  if (profile.dateStart || profile.dateEnd) chips.push({ icon: <CalendarDays size={11} />, txt: `${profile.dateStart ? fmtDate(profile.dateStart) : '…'} → ${profile.dateEnd ? fmtDate(profile.dateEnd) : '…'}` })
  const bar = (val, color) => (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2.5 rounded-full bg-surface overflow-hidden"><div className="h-full rounded-full" style={{ width: `${val}%`, background: color }} /></div>
      <span className="text-xs font-bold w-9 text-right">{val}%</span>
    </div>
  )
  return (
    <div className="card p-4 space-y-3 fade-in">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold flex items-center gap-2">{profile.proposed && <Sparkles size={14} className="text-amber-500" />}{profile.name}</div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {chips.length ? chips.map((c, i) => <span key={i} className="chip bg-surface text-muted flex items-center gap-1">{c.icon}{c.txt}</span>)
              : <span className="chip bg-surface text-muted">Aucun filtre</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {profile.proposed
            ? <button className="btn-ghost !py-1 text-xs" title="Enregistrer ce profil" onClick={() => onSave(profile)}><Save size={13} /> Enregistrer</button>
            : <button className="p-1.5 rounded-lg hover:bg-surface text-red-500" title="Supprimer" onClick={() => onDelete(profile.id)}><Trash2 size={14} /></button>}
        </div>
      </div>

      {matched.length === 0 ? (
        <p className="text-xs text-muted">Aucun deal ne correspond à ce profil pour le moment.</p>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-brand">{s.r1ToSql}%</span>
            <span className="text-sm text-muted">de conversion R1 → SQL</span>
            <span className={`chip ml-auto ${delta >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{delta >= 0 ? '+' : ''}{delta} pts vs moyenne</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-muted"><span className="w-20">R1 → MQL</span>{bar(s.r1ToMql, '#0ea5e9')}</div>
            <div className="flex items-center gap-2 text-xs text-muted"><span className="w-20">MQL → SQL</span>{bar(s.mqlToSql, '#8b5cf6')}</div>
            <div className="flex items-center gap-2 text-xs text-muted"><span className="w-20">R1 → SQL</span>{bar(s.r1ToSql, '#3b5bdb')}</div>
            <div className="flex items-center gap-2 text-xs text-muted"><span className="w-20">Signature</span>{bar(s.signRate, '#10b981')}</div>
          </div>
          <div className="text-xs text-muted border-t border-line pt-2 flex flex-wrap gap-x-4 gap-y-1">
            <span><b className="text-ink">{matched.length}</b> deals ({share}% du pipeline)</span>
            <span><b className="text-ink">{s.mql}</b> MQL · <b className="text-ink">{s.sql}</b> SQL · <b className="text-ink">{s.signed}</b> signés</span>
          </div>
        </>
      )}
    </div>
  )
}

export default function Icp() {
  const store = useStore()
  const sub = store.sub
  const [creating, setCreating] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)

  // Un deal = un RDV racine (on évite de compter les sous-RDV de suivi en double).
  const deals = useMemo(() => (sub.rdvs || []).filter(r => !r.parentId), [sub.rdvs])
  const global = useMemo(() => statsFor(deals), [deals])
  const secteurs = useMemo(() => [...new Set(deals.map(d => d.secteur).filter(Boolean))].sort(), [deals])
  const postes = useMemo(() => [...new Set(deals.flatMap(d => (d.contacts || []).map(c => c.poste)).filter(Boolean))].sort(), [deals])

  // ----- Profils proposés (déduits des données) -----
  const proposed = useMemo(() => {
    if (!deals.length) return []
    const out = []
    // 1) Profil idéal : traits dominants des deals ayant atteint SQL (sinon MQL).
    const winners = deals.filter(d => maxRank(d) >= 3).length ? deals.filter(d => maxRank(d) >= 3) : deals.filter(d => maxRank(d) >= 2)
    if (winners.length) {
      const sec = mode(winners.map(d => d.secteur))
      const bandId = mode(winners.map(d => bandOf(Number(d.effectif) || 0)?.id).filter(Boolean))
      const b = EFF_BANDS.find(x => x.id === bandId)
      const po = mode(winners.flatMap(d => (d.contacts || []).map(c => c.poste)))
      const p = { id: 'icp-ideal', proposed: true, secteurs: sec ? [sec] : [], effMin: b?.min ?? null, effMax: b?.max ?? null, postes: po ? [po] : [] }
      p.name = '🏆 Profil idéal'
      if (p.secteurs.length || p.effMin != null || p.postes.length) out.push(p)
    }
    // 2) Meilleur sur chaque dimension (par taux R1→SQL, ≥1 deal).
    const bestBy = (values, toProfile, keyFn, label) => {
      let best = null
      values.forEach(v => {
        const m = deals.filter(d => keyFn(d, v))
        if (!m.length) return
        const st = statsFor(m)
        if (!best || st.r1ToSql > best.st.r1ToSql || (st.r1ToSql === best.st.r1ToSql && m.length > best.n)) best = { v, st, n: m.length }
      })
      if (best) { const p = toProfile(best.v); p.id = 'icp-' + label; p.proposed = true; p.name = label; out.push(p) }
    }
    bestBy(secteurs, v => ({ secteurs: [v] }), (d, v) => d.secteur === v, 'Meilleur secteur')
    bestBy(EFF_BANDS, b => ({ effMin: b.min, effMax: b.max }), (d, b) => { const e = Number(d.effectif) || 0; return e >= b.min && e <= b.max }, 'Meilleure taille')
    bestBy(postes, v => ({ postes: [v] }), (d, v) => (d.contacts || []).some(c => c.poste === v), 'Meilleur poste')
    return out
  }, [deals, secteurs, postes])

  const saved = sub.icpProfiles || []

  const saveProfile = (p) => {
    store.setSub(d => ({ ...d, icpProfiles: [...(d.icpProfiles || []), { id: uid(), name: p.name?.replace(/^🏆\s*/, '') || autoName(p), secteurs: p.secteurs || [], effMin: p.effMin ?? null, effMax: p.effMax ?? null, postes: p.postes || [], dateStart: p.dateStart || null, dateEnd: p.dateEnd || null, createdAt: todayISO() }] }))
    toast('Profil ICP enregistré')
  }
  const deleteProfile = (id) => { store.setSub(d => ({ ...d, icpProfiles: (d.icpProfiles || []).filter(x => x.id !== id) })); setConfirmDel(null); toast('Profil supprimé') }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-extrabold flex items-center gap-2"><Target size={20} className="text-brand" /> ICP — Profils clients idéaux</h2>
        <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Créer un profil</button>
      </div>
      <p className="text-xs text-muted -mt-2">Quelles entreprises convertissent le mieux (R1 → MQL → SQL) ? Croisement secteur × taille × poste, en pourcentages. Sur {global.total} deal(s).</p>

      {/* Référence globale */}
      <div className="card p-4">
        <div className="text-xs font-bold uppercase tracking-wide text-muted mb-2">Moyenne globale (référence)</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          {[['R1 → MQL', global.r1ToMql], ['MQL → SQL', global.mqlToSql], ['R1 → SQL', global.r1ToSql], ['Signature', global.signRate]].map(([l, v]) => (
            <div key={l}><div className="text-2xl font-extrabold">{v}%</div><div className="text-xs text-muted">{l}</div></div>
          ))}
        </div>
      </div>

      {deals.length === 0 && <Empty text="Aucun deal pour analyser des profils ICP. Créez des rendez-vous pour alimenter l'analyse." />}

      {proposed.length > 0 && (
        <div>
          <h3 className="text-sm font-bold flex items-center gap-1.5 mb-2"><Sparkles size={15} className="text-amber-500" /> Profils proposés</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {proposed.map(p => <ProfileCard key={p.id} profile={p} deals={deals} global={global} onSave={saveProfile} />)}
          </div>
        </div>
      )}

      {saved.length > 0 && (
        <div>
          <h3 className="text-sm font-bold mb-2">Mes profils ICP</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {saved.map(p => <ProfileCard key={p.id} profile={p} deals={deals} global={global} onDelete={setConfirmDel} />)}
          </div>
        </div>
      )}

      {creating && <CreateProfile secteurs={secteurs} postes={postes}
        onClose={() => setCreating(false)}
        onCreate={(p) => { saveProfile(p); setCreating(false) }} />}
      {confirmDel && <Confirm message="Supprimer ce profil ICP ?" onYes={() => deleteProfile(confirmDel)} onNo={() => setConfirmDel(null)} />}
    </div>
  )
}

function CreateProfile({ secteurs, postes, onClose, onCreate }) {
  const [name, setName] = useState('')
  const [secSel, setSecSel] = useState([])
  const [band, setBand] = useState('') // '' = toutes
  const [posSel, setPosSel] = useState([])
  const [dStart, setDStart] = useState('')
  const [dEnd, setDEnd] = useState('')
  const toggle = (arr, setArr, v) => setArr(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v])
  const b = EFF_BANDS.find(x => x.id === band)
  const build = () => ({ secteurs: secSel, effMin: b?.min ?? null, effMax: b?.max ?? null, postes: posSel, dateStart: dStart || null, dateEnd: dEnd || null, name: name.trim() })

  return (
    <Modal title="Créer un profil ICP" onClose={onClose} wide>
      <div className="space-y-3">
        <Field label="Nom (optionnel)"><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder={autoName(build()) || 'Mon profil ICP'} /></Field>
        <div>
          <span className="label">Secteur(s)</span>
          <div className="flex flex-wrap gap-1.5">
            {secteurs.length === 0 && <span className="text-xs text-muted">Aucun secteur dans vos données.</span>}
            {secteurs.map(s => <button key={s} type="button" className={`chip ${secSel.includes(s) ? 'bg-brand text-white' : 'bg-surface text-muted'}`} onClick={() => toggle(secSel, setSecSel, s)}>{s}</button>)}
          </div>
        </div>
        <div>
          <span className="label">Taille d'entreprise (employés)</span>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={`chip ${band === '' ? 'bg-brand text-white' : 'bg-surface text-muted'}`} onClick={() => setBand('')}>Toutes</button>
            {EFF_BANDS.map(x => <button key={x.id} type="button" className={`chip ${band === x.id ? 'bg-brand text-white' : 'bg-surface text-muted'}`} onClick={() => setBand(x.id)}>{x.label}</button>)}
          </div>
        </div>
        <div>
          <span className="label">Poste(s) du contact</span>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {postes.length === 0 && <span className="text-xs text-muted">Aucun poste dans vos données.</span>}
            {postes.map(p => <button key={p} type="button" className={`chip ${posSel.includes(p) ? 'bg-brand text-white' : 'bg-surface text-muted'}`} onClick={() => toggle(posSel, setPosSel, p)}>{p}</button>)}
          </div>
        </div>
        <div>
          <span className="label">Période recherchée (date d'ouverture des deals)</span>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" className="input !w-auto" value={dStart} onChange={e => setDStart(e.target.value)} />
            <span className="text-muted text-sm">→</span>
            <input type="date" className="input !w-auto" value={dEnd} onChange={e => setDEnd(e.target.value)} />
            {(dStart || dEnd) && <button type="button" className="text-xs text-brand underline" onClick={() => { setDStart(''); setDEnd('') }}>Effacer</button>}
          </div>
        </div>
        <p className="text-xs text-muted">Laissez une dimension vide pour ne pas filtrer dessus. Le profil affichera les taux de conversion des deals correspondants.</p>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={() => onCreate(build())}>Créer le profil</button>
        </div>
      </div>
    </Modal>
  )
}
