import React, { useMemo, useState } from 'react'
import { Target, Plus, Trash2, Building2, Users2, Briefcase, Sparkles, Save, CalendarDays, MapPin, Handshake, Scissors, UserRound, Users } from 'lucide-react'
import { useStore, uid, todayISO, fmtDate, phaseRank, isWonPhase, qualifyPhase, milestonePhase, icpMatches, icpKindOf, ICP_KINDS, ICP_COMPANY_KEYS, ICP_PERSON_KEYS, committeeRoles, committeeRelations, companyKey } from '../store.jsx'
import { Modal, Field, Empty, Confirm, toast } from '../ui.jsx'

// Rang de progression d'un deal : sa position dans le pipeline DE L'ÉQUIPE. Une table figée
// (R1=1, MQL=2, SQL=3…) donnait le même rang à toutes les étapes d'un pipeline renommé,
// et l'ICP notait alors tous les comptes à l'identique.
function maxRank(rdv, data) {
  let r = phaseRank(data, rdv.phase)
  if (r < 0) r = 0 // étape d'échec : hors course, mais le compte a bien existé
  ;(rdv.history || []).forEach(h => {
    if (h.type !== 'phase') return
    const v = phaseRank(data, h.value)
    if (v > r) r = v
  })
  return r
}
// « Ce deal a-t-il atteint au moins telle étape ? » — les seuils numériques d'origine
// (>= 2, >= 3, >= 4) supposaient le pipeline par défaut et se décalaient dès qu'une
// équipe ajoutait ou retirait une étape.
const reached = (rdv, data, refPhase) => {
  const ref = phaseRank(data, refPhase)
  return ref >= 0 && maxRank(rdv, data) >= ref
}
const reachedWon = (rdv, data) =>
  isWonPhase(data, rdv.phase) || (rdv.history || []).some(h => h.type === 'phase' && isWonPhase(data, h.value))
const EFF_BANDS = [
  { id: '1-50', label: '1–50', min: 1, max: 50 },
  { id: '51-200', label: '51–200', min: 51, max: 200 },
  { id: '201-500', label: '201–500', min: 201, max: 500 },
  { id: '500+', label: '500 et +', min: 501, max: 1e12 },
]
const bandOf = (eff) => EFF_BANDS.find(b => eff >= b.min && eff <= b.max)
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0)

function statsFor(deals, data) {
  const total = deals.length
  const mql = deals.filter(d => reached(d, data, qualifyPhase(data))).length
  const sql = deals.filter(d => reached(d, data, milestonePhase(data))).length
  const signed = deals.filter(d => reachedWon(d, data)).length
  return { total, mql, sql, signed, r1ToMql: pct(mql, total), mqlToSql: pct(sql, mql), r1ToSql: pct(sql, total), signRate: pct(signed, total) }
}
const mode = (arr) => {
  const m = {}; arr.forEach(v => { if (v) m[v] = (m[v] || 0) + 1 })
  return Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0] || null
}
const bandLabel = (p) => EFF_BANDS.find(b => b.min === p.effMin && b.max === p.effMax)?.label || `${p.effMin ?? 0}–${p.effMax ?? '∞'}`
const autoName = (p) => {
  const parts = []
  if (p.secteurs?.length) parts.push(p.secteurs.join('/'))
  if (p.effMin != null || p.effMax != null) parts.push(bandLabel(p) + ' empl.')
  if (p.localisations?.length) parts.push(p.localisations.join('/'))
  if (p.postes?.length) parts.push(p.postes.join('/'))
  if (p.roles?.length) parts.push(p.roles.join('/'))
  if (p.relations?.length) parts.push(p.relations.join('/'))
  if (p.dateStart || p.dateEnd) parts.push(`${p.dateStart ? fmtDate(p.dateStart) : '…'}→${p.dateEnd ? fmtDate(p.dateEnd) : '…'}`)
  return parts.join(' · ') || 'Tous les deals'
}

function chipsOf(profile) {
  const chips = []
  if (profile.secteurs?.length) chips.push({ icon: <Building2 size={11} />, txt: profile.secteurs.join(', ') })
  if (profile.effMin != null || profile.effMax != null) chips.push({ icon: <Users2 size={11} />, txt: bandLabel(profile) + ' empl.' })
  if (profile.localisations?.length) chips.push({ icon: <MapPin size={11} />, txt: profile.localisations.join(', ') })
  if (profile.postes?.length) chips.push({ icon: <Briefcase size={11} />, txt: profile.postes.join(', ') })
  if (profile.roles?.length) chips.push({ icon: <Target size={11} />, txt: profile.roles.join(', ') })
  if (profile.relations?.length) chips.push({ icon: <Handshake size={11} />, txt: profile.relations.join(', ') })
  if (profile.dateStart || profile.dateEnd) chips.push({ icon: <CalendarDays size={11} />, txt: `${profile.dateStart ? fmtDate(profile.dateStart) : '…'} → ${profile.dateEnd ? fmtDate(profile.dateEnd) : '…'}` })
  return chips
}

function ProfileCard({ profile, deals, global, data, companies, onSave, onDelete, onSplit }) {
  // ⚠️ `companies` est passé À PART de `data` : les statistiques se lisent avec le pipeline
  // de MON espace (les phases sont un vocabulaire d'environnement), mais les traits
  // d'entreprise avec les fiches DU PÉRIMÈTRE — celle qu'un collègue a remplie fait foi.
  const withSheets = { ...data, companies }
  const matched = deals.filter(d => icpMatches(d, profile, { data: withSheets }))
  const s = statsFor(matched, data)
  const delta = s.r1ToSql - global.r1ToSql
  const share = pct(matched.length, global.total)
  const chips = chipsOf(profile)
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
          <div className="font-bold flex items-center gap-2">
            {profile.proposed && <Sparkles size={14} className="text-amber-500" />}{profile.name}
            {profile._owner && <span className="chip bg-brand/10 text-brand font-normal">{profile._owner}</span>}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {chips.length ? chips.map((c, i) => <span key={i} className="chip bg-surface text-muted flex items-center gap-1">{c.icon}{c.txt}</span>)
              : <span className="chip bg-surface text-muted">Aucun filtre</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onSplit && <button className="btn-ghost !py-1 text-xs" title="Séparer ce profil en deux" onClick={() => onSplit(profile)}><Scissors size={13} /> Séparer</button>}
          {profile.proposed
            ? <button className="btn-ghost !py-1 text-xs" title="Enregistrer ce profil" onClick={() => onSave(profile)}><Save size={13} /> Enregistrer</button>
            : onDelete && <button className="p-1.5 rounded-lg hover:bg-surface text-red-500" title="Supprimer" onClick={() => onDelete(profile.id)}><Trash2 size={14} /></button>}
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

// Une famille d'ICP : son titre, la question à laquelle elle répond, ses propositions
// et ses profils enregistrés. Les deux natures s'affichent avec la même mécanique —
// une seule implémentation, donc une correction vaut pour les deux.
function KindSection({ kind, proposed, saved, deals, global, data, companies, onCreate, onSave, onDelete }) {
  const meta = ICP_KINDS.find(k => k.id === kind)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold flex items-center gap-1.5">
          {kind === 'company' ? <Building2 size={15} className="text-brand" /> : <Briefcase size={15} className="text-brand" />}
          {meta.label}
          <span className="font-normal text-muted">— {meta.question}</span>
        </h3>
        <button className="btn-ghost !py-1 text-xs" onClick={onCreate}><Plus size={14} /> Créer un profil</button>
      </div>
      {!proposed.length && !saved.length && (
        <p className="text-xs text-muted">Aucun profil pour l'instant.</p>
      )}
      {proposed.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {proposed.map(p => <ProfileCard key={p.id} profile={p} deals={deals} global={global} data={data} companies={companies} onSave={onSave} />)}
        </div>
      )}
      {saved.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {saved.map(p => <ProfileCard key={p.id} profile={p} deals={deals} global={global} data={data} companies={companies}
            onDelete={p._mine === false ? null : onDelete} />)}
        </div>
      )}
    </div>
  )
}

export default function Icp() {
  const store = useStore()
  const sub = store.sub
  const env = store.env
  const [scope, setScope] = useState('me') // 'me' = mon espace | 'org' = tout l'environnement
  const [creating, setCreating] = useState(null) // 'company' | 'person' | null
  const [confirmDel, setConfirmDel] = useState(null)
  const committeeOn = store.hasModule('committee')

  // ⚠️ DEUX PÉRIMÈTRES, exactement comme le pipeline de Leads. « Mon ICP » est ce que MES
  // affaires m'apprennent ; l'ICP de l'environnement est ce que TOUTE l'équipe a appris —
  // et les deux diffèrent presque toujours. Un commercial seul n'a jamais assez de deals
  // signés pour qu'un taux veuille dire quelque chose ; l'équipe, si. Ne montrer que le
  // premier, c'était tirer des conclusions sur dix affaires.
  const envSubs = useMemo(
    () => store.db.subenvs.filter(x => x.envId === store.session?.envId),
    [store.db.subenvs, store.session?.envId],
  )
  const org = scope === 'org'

  // Les données du périmètre courant. En vue équipe, chaque deal porte son propriétaire :
  // un enseignement anonyme ne se vérifie pas, et ne se transmet pas.
  const deals = useMemo(() => {
    if (!org) return (sub.rdvs || []).filter(r => !r.parentId)
    return envSubs.flatMap(x => ((store.db.data[x.id]?.rdvs) || [])
      .filter(r => !r.parentId)
      .map(r => ({ ...r, _owner: `${x.prenom} ${x.nom}`, _subId: x.id })))
  }, [org, sub.rdvs, envSubs, store.db.data])

  // ⚠️ Les fiches entreprise aussi sont agrégées : secteur, effectif et implantation vivent
  // sur la fiche, et une fiche remplie par un collègue vaut pour tout le monde.
  const companies = useMemo(() => {
    if (!org) return sub.companies || {}
    const all = {}
    envSubs.forEach(x => Object.assign(all, store.db.data[x.id]?.companies || {}))
    return all
  }, [org, sub.companies, envSubs, store.db.data])

  // ⚠️ Le pipeline de référence reste celui de MON espace : les phases, les étapes de
  // qualification et de jalon sont un vocabulaire d'environnement, pas une donnée de deal.
  const ref = sub

  // Les valeurs proposées viennent des DONNÉES, jamais d'une liste inventée : un critère
  // qu'aucun deal ne porte ne sélectionnerait rien, et on ne saurait pas pourquoi.
  const sheetOf = (d) => companies[companyKey(d.entreprise)] || null
  const global = useMemo(() => statsFor(deals, ref), [deals, ref])
  const secteurs = useMemo(() => [...new Set(deals.map(d => sheetOf(d)?.secteur || d.secteur).filter(Boolean))].sort(), [deals, companies]) // eslint-disable-line
  const localisations = useMemo(() => [...new Set(deals.map(d => sheetOf(d)?.localisation).filter(Boolean))].sort(), [deals, companies]) // eslint-disable-line
  const postes = useMemo(() => [...new Set(deals.flatMap(d => (d.contacts || []).map(c => c.poste)).filter(Boolean))].sort(), [deals])
  const roles = useMemo(() => (committeeOn ? committeeRoles(env) : []), [committeeOn, env])
  const relations = useMemo(() => (committeeOn ? committeeRelations(env) : []), [committeeOn, env])
  const vocab = { secteurs, localisations, postes, roles, relations }

  // ----- Profils proposés (déduits des données) -----
  const proposed = useMemo(() => {
    if (!deals.length) return []
    const out = []
    // 1) Profils idéaux : traits dominants des deals ayant atteint SQL (sinon MQL).
    //    Un pour l'entreprise, un pour l'interlocuteur — ce sont deux enseignements
    //    distincts, et les réunir dans une carte empêchait de n'en retenir qu'un.
    const atMilestone = deals.filter(d => reached(d, ref, milestonePhase(ref)))
    const winners = atMilestone.length ? atMilestone : deals.filter(d => reached(d, ref, qualifyPhase(ref)))
    if (winners.length) {
      const sec = mode(winners.map(d => sheetOf(d)?.secteur || d.secteur))
      const bandId = mode(winners.map(d => bandOf(Number(sheetOf(d)?.effectif || d.effectif) || 0)?.id).filter(Boolean))
      const b = EFF_BANDS.find(x => x.id === bandId)
      const pc = { id: 'icp-ideal-company', kind: 'company', proposed: true, name: '🏆 Entreprise idéale', secteurs: sec ? [sec] : [], effMin: b?.min ?? null, effMax: b?.max ?? null }
      if (pc.secteurs.length || pc.effMin != null) out.push(pc)
      const po = mode(winners.flatMap(d => (d.contacts || []).map(c => c.poste)))
      const ro = committeeOn ? mode(winners.flatMap(d => (d.contacts || []).map(c => c.role))) : null
      const pp = { id: 'icp-ideal-person', kind: 'person', proposed: true, name: '🏆 Interlocuteur idéal', postes: po ? [po] : [], roles: ro ? [ro] : [] }
      if (pp.postes.length || pp.roles.length) out.push(pp)
    }
    // 2) Meilleur sur chaque dimension (par taux R1→SQL, ≥1 deal).
    const bestBy = (values, toProfile, keyFn, label, kind) => {
      let best = null
      values.forEach(v => {
        const m = deals.filter(d => keyFn(d, v))
        if (!m.length) return
        const st = statsFor(m, ref)
        if (!best || st.r1ToSql > best.st.r1ToSql || (st.r1ToSql === best.st.r1ToSql && m.length > best.n)) best = { v, st, n: m.length }
      })
      if (best) { const p = toProfile(best.v); p.id = 'icp-' + label; p.kind = kind; p.proposed = true; p.name = label; out.push(p) }
    }
    bestBy(secteurs, v => ({ secteurs: [v] }), (d, v) => (sheetOf(d)?.secteur || d.secteur) === v, 'Meilleur secteur', 'company')
    bestBy(EFF_BANDS, b => ({ effMin: b.min, effMax: b.max }), (d, b) => { const e = Number(sheetOf(d)?.effectif || d.effectif) || 0; return e >= b.min && e <= b.max }, 'Meilleure taille', 'company')
    bestBy(localisations, v => ({ localisations: [v] }), (d, v) => sheetOf(d)?.localisation === v, 'Meilleure implantation', 'company')
    bestBy(postes, v => ({ postes: [v] }), (d, v) => (d.contacts || []).some(c => c.poste === v), 'Meilleur poste', 'person')
    if (committeeOn) bestBy(roles, v => ({ roles: [v] }), (d, v) => (d.contacts || []).some(c => c.role === v), "Meilleur rôle d'achat", 'person')
    return out
  }, [deals, secteurs, localisations, postes, roles, committeeOn, ref])

  // Les profils ENREGISTRÉS du périmètre. En vue équipe on montre ceux de tout le monde,
  // chacun avec son auteur : un profil est un enseignement, et savoir de qui il vient
  // permet d'aller lui demander pourquoi.
  // ⚠️ `_mine` commande la suppression : on ne touche jamais au profil d'un collègue.
  const saved = useMemo(() => {
    const mine = (sub.icpProfiles || []).map(p => ({ ...p, _mine: true }))
    if (!org) return mine
    const mySubId = store.session?.subEnvId
    const others = envSubs.filter(x => x.id !== mySubId).flatMap(x =>
      ((store.db.data[x.id]?.icpProfiles) || []).map(p => ({ ...p, _owner: `${x.prenom} ${x.nom}`, _mine: false })))
    return [...mine, ...others]
  }, [org, sub.icpProfiles, envSubs, store.db.data, store.session?.subEnvId])
  const byKind = (list, k) => list.filter(p => icpKindOf(p) === k)
  const legacy = byKind(saved, 'mixed')

  const saveProfile = (p) => {
    const kind = p.kind === 'person' ? 'person' : 'company'
    const keep = kind === 'person' ? ICP_PERSON_KEYS : ICP_COMPANY_KEYS
    const crit = {}
    keep.forEach(k => { if (p[k] != null) crit[k] = p[k] })
    store.setSub(d => ({ ...d, icpProfiles: [...(d.icpProfiles || []), { id: uid(), kind, name: p.name?.replace(/^🏆\s*/, '') || autoName(p), ...crit, dateStart: p.dateStart || null, dateEnd: p.dateEnd || null, createdAt: todayISO() }] }))
    toast('Profil ICP enregistré')
  }
  const deleteProfile = (id) => { store.setSub(d => ({ ...d, icpProfiles: (d.icpProfiles || []).filter(x => x.id !== id) })); setConfirmDel(null); toast('Profil supprimé') }
  // Séparer un profil d'avant la distinction. ⚠️ C'est un CHOIX de l'utilisateur, jamais
  // une migration : les deux moitiés sélectionnent chacune plus largement que l'ensemble
  // qu'elles remplacent, et réécrire cela d'office aurait changé son pipeline sans un mot.
  const splitProfile = (p) => {
    const pick = (keys) => { const o = {}; keys.forEach(k => { if (p[k] != null) o[k] = p[k] }); return o }
    store.setSub(d => ({
      ...d,
      icpProfiles: (d.icpProfiles || []).flatMap(x => x.id !== p.id ? [x] : [
        { id: uid(), kind: 'company', name: p.name, ...pick(ICP_COMPANY_KEYS), dateStart: p.dateStart || null, dateEnd: p.dateEnd || null, createdAt: todayISO() },
        { id: uid(), kind: 'person', name: `${p.name} — interlocuteurs`, ...pick(ICP_PERSON_KEYS), dateStart: p.dateStart || null, dateEnd: p.dateEnd || null, createdAt: todayISO() },
      ]),
    }))
    toast('Profil séparé en deux')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-extrabold flex items-center gap-2"><Target size={20} className="text-brand" /> ICP — Profils clients idéaux</h2>
        {/* Deux périmètres, même bascule que le pipeline de Leads : on lit son portefeuille,
            ou celui de toute l'équipe, sans changer d'écran. */}
        <div className="flex rounded-lg border border-line overflow-hidden">
          <button className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${!org ? 'bg-brand text-white' : 'bg-card text-muted hover:bg-surface'}`}
            onClick={() => setScope('me')}><UserRound size={13} /> Mon ICP</button>
          <button className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${org ? 'bg-brand text-white' : 'bg-card text-muted hover:bg-surface'}`}
            onClick={() => setScope('org')}><Users size={13} /> ICP de l'entreprise</button>
        </div>
      </div>
      <p className="text-xs text-muted -mt-2">
        {org
          ? <>Ce que TOUTE l'équipe a appris : tous les comptes de tous les espaces de l'environnement. Un seul portefeuille a rarement assez de signatures pour qu'un taux veuille dire quelque chose — celui-ci, si. Sur <b className="text-ink">{global.total}</b> deal(s), {envSubs.length} espace(s).</>
          : <>Deux questions, deux profils : quelles entreprises viser, et à qui parler dedans. Conversions R1 → MQL → SQL en pourcentages, sur <b className="text-ink">{global.total}</b> deal(s).</>}
      </p>

      {/* Référence globale */}
      <div className="card p-4">
        <div className="text-xs font-bold uppercase tracking-wide text-muted mb-2">
          {org ? "Moyenne de l'entreprise (référence)" : 'Moyenne globale (référence)'}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          {[['R1 → MQL', global.r1ToMql], ['MQL → SQL', global.mqlToSql], ['R1 → SQL', global.r1ToSql], ['Signature', global.signRate]].map(([l, v]) => (
            <div key={l}><div className="text-2xl font-extrabold">{v}%</div><div className="text-xs text-muted">{l}</div></div>
          ))}
        </div>
      </div>

      {deals.length === 0 && <Empty text="Aucun deal pour analyser des profils ICP. Créez des rendez-vous pour alimenter l'analyse." />}
      {org && <p className="text-xs text-muted">Les profils de vos collègues sont lisibles, jamais modifiables ici — enregistrer une proposition la range dans VOTRE espace.</p>}

      {ICP_KINDS.map(k => (
        <KindSection key={k.id} kind={k.id} deals={deals} global={global} data={ref} companies={companies}
          proposed={byKind(proposed, k.id)} saved={byKind(saved, k.id)}
          onCreate={() => setCreating(k.id)} onSave={saveProfile} onDelete={setConfirmDel} />
      ))}

      {legacy.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold">Profils mixtes</h3>
          <p className="text-xs text-muted">Créés avant la séparation, ils filtrent à la fois sur l'entreprise et sur l'interlocuteur. Ils continuent de fonctionner tels quels ; « Séparer » en fait deux profils, un par question.</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {legacy.map(p => <ProfileCard key={p.id} profile={p} deals={deals} global={global} data={ref} companies={companies} onDelete={p._mine === false ? null : setConfirmDel} onSplit={p._mine === false ? null : splitProfile} />)}
          </div>
        </div>
      )}

      {creating && <CreateProfile kind={creating} vocab={vocab} committeeOn={committeeOn}
        onClose={() => setCreating(null)}
        onCreate={(p) => { saveProfile(p); setCreating(null) }} />}
      {confirmDel && <Confirm message="Supprimer ce profil ICP ?" onYes={() => deleteProfile(confirmDel)} onNo={() => setConfirmDel(null)} />}
    </div>
  )
}

function CreateProfile({ kind, vocab, committeeOn, onClose, onCreate }) {
  const meta = ICP_KINDS.find(k => k.id === kind)
  const [name, setName] = useState('')
  const [secSel, setSecSel] = useState([])
  const [band, setBand] = useState('') // '' = toutes
  const [locSel, setLocSel] = useState([])
  const [posSel, setPosSel] = useState([])
  const [roleSel, setRoleSel] = useState([])
  const [relSel, setRelSel] = useState([])
  const [dStart, setDStart] = useState('')
  const [dEnd, setDEnd] = useState('')
  const toggle = (arr, setArr, v) => setArr(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v])
  const b = EFF_BANDS.find(x => x.id === band)
  const build = () => (kind === 'person'
    ? { kind, postes: posSel, roles: roleSel, relations: relSel, dateStart: dStart || null, dateEnd: dEnd || null, name: name.trim() }
    : { kind, secteurs: secSel, effMin: b?.min ?? null, effMax: b?.max ?? null, localisations: locSel, dateStart: dStart || null, dateEnd: dEnd || null, name: name.trim() })

  const picker = (label, values, sel, setSel, empty) => (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
        {values.length === 0 && <span className="text-xs text-muted">{empty}</span>}
        {values.map(v => <button key={v} type="button" className={`chip ${sel.includes(v) ? 'bg-brand text-white' : 'bg-surface text-muted'}`} onClick={() => toggle(sel, setSel, v)}>{v}</button>)}
      </div>
    </div>
  )

  return (
    <Modal title={meta.createLabel} onClose={onClose} wide>
      <div className="space-y-3">
        <p className="text-xs text-muted">{meta.question}</p>
        <Field label="Nom (optionnel)"><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder={autoName(build()) || 'Mon profil ICP'} /></Field>

        {kind === 'company' ? (
          <>
            {picker('Secteur(s)', vocab.secteurs, secSel, setSecSel, 'Aucun secteur dans vos données.')}
            <div>
              <span className="label">Taille d'entreprise (employés)</span>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className={`chip ${band === '' ? 'bg-brand text-white' : 'bg-surface text-muted'}`} onClick={() => setBand('')}>Toutes</button>
                {EFF_BANDS.map(x => <button key={x.id} type="button" className={`chip ${band === x.id ? 'bg-brand text-white' : 'bg-surface text-muted'}`} onClick={() => setBand(x.id)}>{x.label}</button>)}
              </div>
            </div>
            {picker('Implantation', vocab.localisations, locSel, setLocSel, "Aucune implantation connue. Renseignez la localisation sur les fiches entreprise (ou laissez l'enrichissement la trouver).")}
          </>
        ) : (
          <>
            {picker('Poste(s) du contact', vocab.postes, posSel, setPosSel, 'Aucun poste dans vos données.')}
            {committeeOn ? (
              <>
                {picker("Rôle dans la décision", vocab.roles, roleSel, setRoleSel, 'Aucun rôle défini.')}
                {picker('État de la relation', vocab.relations, relSel, setRelSel, 'Aucun état défini.')}
              </>
            ) : (
              <p className="text-xs text-muted">Le rôle dans la décision et l'état de la relation viennent du module « Comité d'achat », qui n'est pas installé sur cet environnement.</p>
            )}
          </>
        )}

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
