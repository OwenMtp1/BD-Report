import React, { useMemo, useState } from 'react'
import { Plus, MoreVertical, ChevronRight, ChevronDown, Settings2, CornerDownRight, AlertTriangle, CalendarDays, Table as TableIcon, ChevronLeft } from 'lucide-react'
import { useStore, uid, todayISO, fmtDate, parseISO, applyRdvAutomations, rdvNeedsSqlDate, syncContacts, ensurePrimeSnapshot, findContactDuplicates, SOURCES, PHASE_COLORS, OPP_COLORS, phaseColor, oppColor, RDV_FIELDS, inTimeline, companyKey } from '../store.jsx'
import { Modal, Confirm, Field, Select, EditableSelect, Empty, toast, confetti, DictateButton } from '../ui.jsx'
import { openCompany } from './Company.jsx'

// Déclenche les confettis + un toast quand un RDV devient « Signée » (feature 24)
const isSigned = (phase, opp) => phase === 'Signée' || opp === 'Signée'
function celebrateIfSigned(before, afterPhase, afterOpp, entreprise) {
  if (isSigned(afterPhase, afterOpp) && !isSigned(before.phase, before.opportunite)) {
    confetti()
    toast(`🎉 Signature ! Bravo pour ${entreprise || 'ce deal'} 🏆`)
  }
}

const emptyContact = () => ({ id: uid(), nom: '', poste: '', email: '', tel: '' })

function emptyForm() {
  return {
    source: '', phase: '', opportunite: 'En cours', entreprise: '', effectif: '', secteur: '',
    linkedin: '', provenance: '', contacts: [emptyContact()], dateRdv: '', datePriseRdv: todayISO(),
    datePassageSQL: '', notes: '',
  }
}

// ---------------------------------------------------------------- Formulaire RDV
function RdvForm({ initial, title, onSave, onClose, sub, setSubList, isCreate, findOrgOwners }) {
  const [f, setF] = useState(initial)
  const [err, setErr] = useState('')
  const visible = (k) => sub.fieldsConfig.find(c => c.key === k)?.visible !== false
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const setContact = (i, k, v) => setF(x => ({ ...x, contacts: x.contacts.map((c, j) => j === i ? { ...c, [k]: v } : c) }))

  // Détection de doublons : entreprise déjà suivie / email déjà connu
  const dupRdvs = isCreate && f.entreprise.trim().length > 1
    ? sub.rdvs.filter(r => (r.entreprise || '').trim().toLowerCase() === f.entreprise.trim().toLowerCase())
    : []
  const dupEmails = f.contacts.map(c => c.email.trim().toLowerCase()).filter(e =>
    e && sub.contacts.some(c => (c.email || '').toLowerCase() === e))
  // Conflit de comptes : un autre membre de l'organisation travaille déjà cette entreprise
  const orgOwners = f.entreprise.trim().length > 1 && findOrgOwners ? findOrgOwners(f.entreprise) : []

  const submit = () => {
    if (!f.phase || !f.entreprise || !f.provenance) {
      setErr('Champs obligatoires : Phase de transaction, Nom d\'entreprise, Provenance du lead.')
      return
    }
    onSave(f)
  }

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {visible('phase') && <Field label="Phase de transaction" required>
          <EditableSelect value={f.phase} onChange={v => set('phase', v)} options={sub.phases}
            onOptionsChange={o => setSubList('phases', o)} label="phases" />
        </Field>}
        {visible('opportunite') && <Field label="Opportunité">
          <EditableSelect value={f.opportunite} onChange={v => set('opportunite', v)} options={sub.opportunites}
            onOptionsChange={o => setSubList('opportunites', o)} label="statuts d'opportunité" />
        </Field>}
        {visible('entreprise') && <Field label="Nom de l'entreprise" required>
          <input className="input" value={f.entreprise} onChange={e => set('entreprise', e.target.value)} />
        </Field>}
        {visible('effectif') && <Field label="Nombre de collaborateurs">
          <input type="number" className="input" value={f.effectif} onChange={e => set('effectif', e.target.value)} />
        </Field>}
        {visible('secteur') && <Field label="Secteur d'activité">
          <input className="input" value={f.secteur} onChange={e => set('secteur', e.target.value)} />
        </Field>}
        {visible('source') && <Field label="Source">
          <Select value={f.source} onChange={v => set('source', v)} options={SOURCES} />
        </Field>}
        {visible('provenance') && <Field label="Provenance du lead" required>
          <EditableSelect value={f.provenance} onChange={v => set('provenance', v)} options={sub.provenances}
            onOptionsChange={o => setSubList('provenances', o)} label="provenances" />
        </Field>}
        {visible('linkedin') && <Field label="Profil LinkedIn">
          <input className="input" placeholder="https://linkedin.com/in/..." value={f.linkedin} onChange={e => set('linkedin', e.target.value)} />
        </Field>}
        {visible('datePriseRdv') && <Field label="Date de prise de rendez-vous">
          <input type="date" className="input" value={f.datePriseRdv} onChange={e => set('datePriseRdv', e.target.value)} />
        </Field>}
        {visible('dateRdv') && <Field label="Date du RDV">
          <input type="date" className="input" value={f.dateRdv} onChange={e => set('dateRdv', e.target.value)} />
        </Field>}
        {/* Champ affiché seulement si pertinent : phase SQL/Signée ou opportunité Gagnée/Signée (micro 8) */}
        {(['SQL', 'Signée'].includes(f.phase) || ['Gagnée', 'Signée'].includes(f.opportunite) || f.datePassageSQL) && (
          <Field label="Date de passage en SQL">
            <input type="date" className="input" value={f.datePassageSQL} onChange={e => set('datePassageSQL', e.target.value)} />
          </Field>
        )}
        {f.opportunite === 'Perdue' && <Field label="Motif de la perte">
          <EditableSelect value={f.motifKo || ''} onChange={v => set('motifKo', v)} options={sub.lostReasons || []}
            onOptionsChange={o => setSubList('lostReasons', o)} label="motifs" />
        </Field>}
        {(f.opportunite === 'No Show R1' || f.opportunite === 'No Show MQL') && <Field label="Raison du no-show">
          <EditableSelect value={f.motifNoShow || ''} onChange={v => set('motifNoShow', v)} options={sub.noShowReasons || []}
            onOptionsChange={o => setSubList('noShowReasons', o)} label="raisons" />
        </Field>}
      </div>

      {(visible('contact') || visible('poste') || visible('email') || visible('tel')) && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="label !mb-0">Contacts</span>
            <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => setF(x => ({ ...x, contacts: [...x.contacts, emptyContact()] }))}>
              <Plus size={13} /> Rajouter un contact
            </button>
          </div>
          {f.contacts.map((c, i) => (
            <div key={c.id} className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2 p-3 rounded-xl bg-surface relative">
              {visible('contact') && <input className="input" placeholder="Nom & Prénom" value={c.nom} onChange={e => setContact(i, 'nom', e.target.value)} />}
              {visible('poste') && <input className="input" placeholder="Poste" value={c.poste} onChange={e => setContact(i, 'poste', e.target.value)} />}
              {visible('email') && <input className="input" placeholder="Email" value={c.email} onChange={e => setContact(i, 'email', e.target.value)} />}
              {visible('tel') && <input className="input" placeholder="Téléphone" value={c.tel} onChange={e => setContact(i, 'tel', e.target.value)} />}
              {f.contacts.length > 1 && (
                <button type="button" className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs"
                  onClick={() => setF(x => ({ ...x, contacts: x.contacts.filter((_, j) => j !== i) }))}>×</button>
              )}
            </div>
          ))}
        </div>
      )}

      {visible('notes') && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="label !mb-0">Notes</span>
            <DictateButton onText={(txt) => setF(x => ({ ...x, notes: (x.notes ? x.notes + ' ' : '') + txt }))} />
          </div>
          <textarea className="input min-h-[110px]" value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Saisissez ou dictez vos notes..." />
        </div>
      )}

      {dupRdvs.length > 0 && (
        <div className="mt-3 rounded-xl bg-amber-50 border border-amber-300 p-3 text-xs text-amber-800 flex gap-2">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <span><b>Doublon possible :</b> « {f.entreprise} » a déjà {dupRdvs.length} rendez-vous ({dupRdvs.map(r => r.phase).join(', ')}).
            Si c'est une suite, préférez « Créer le rendez-vous suivant » depuis le menu ⋯ du RDV existant.</span>
        </div>
      )}
      {dupEmails.length > 0 && (
        <div className="mt-2 rounded-xl bg-sky-50 border border-sky-300 p-3 text-xs text-sky-800 flex gap-2">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <span>Contact déjà connu ({dupEmails.join(', ')}) : il ne sera pas dupliqué dans Mes contacts.</span>
        </div>
      )}
      {orgOwners.length > 0 && (
        <div className="mt-2 rounded-xl bg-purple-50 border border-purple-300 p-3 text-xs text-purple-800 flex gap-2">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <span><b>Conflit de compte possible :</b> « {f.entreprise} » est déjà travaillée par <b>{orgOwners.join(', ')}</b> dans votre organisation.
            Vérifiez les commentaires d'équipe sur la fiche entreprise avant de prospecter.</span>
        </div>
      )}
      {err && <p className="text-red-500 text-sm mt-3">{err}</p>}
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn-primary" onClick={submit}>Enregistrer le rendez-vous</button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- Vue calendrier (jour / semaine / mois / année)
const dayISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function RdvPill({ r, onOpen, full }) {
  return (
    <button onClick={() => onOpen(r)} title={`${r.entreprise} — ${r.phase}`}
      className={`block w-full truncate text-left font-semibold rounded px-1.5 py-0.5 mt-0.5 ${full ? 'text-xs' : 'text-[10px]'} ${phaseColor(r.phase)}`}>
      {r.entreprise}{full ? ` · ${r.phase}` : ''}
    </button>
  )
}

function CalendarView({ rdvs, onOpen }) {
  const [mode, setMode] = useState('month') // 'day' | 'week' | 'month' | 'year'
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })
  const today = todayISO()

  const shift = (dir) => setCursor(c => {
    const d = new Date(c)
    if (mode === 'day') d.setDate(d.getDate() + dir)
    if (mode === 'week') d.setDate(d.getDate() + dir * 7)
    if (mode === 'month') d.setMonth(d.getMonth() + dir)
    if (mode === 'year') d.setFullYear(d.getFullYear() + dir)
    return d
  })

  const titles = {
    day: cursor.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    week: (() => { const s = new Date(cursor); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); const e = new Date(s); e.setDate(e.getDate() + 6); return `${s.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} → ${e.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}` })(),
    month: cursor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
    year: String(cursor.getFullYear()),
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded-lg hover:bg-surface" onClick={() => shift(-1)}><ChevronLeft size={17} /></button>
          <span className="font-bold capitalize min-w-[12rem] text-center">{titles[mode]}</span>
          <button className="p-1.5 rounded-lg hover:bg-surface" onClick={() => shift(1)}><ChevronRight size={17} /></button>
          <button className="btn-ghost !py-1 text-xs ml-1" onClick={() => setCursor(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })}>Aujourd'hui</button>
        </div>
        <div className="flex rounded-lg border border-line overflow-hidden">
          {[['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois'], ['year', 'Année']].map(([m, l]) => (
            <button key={m} className={`px-3 py-1.5 text-xs font-semibold ${mode === m ? 'bg-brand text-white' : 'bg-card text-muted hover:bg-surface'}`}
              onClick={() => setMode(m)}>{l}</button>
          ))}
        </div>
      </div>

      {mode === 'day' && (() => {
        const list = rdvs.filter(r => r.dateRdv === dayISO(cursor))
        return list.length === 0 ? <Empty text="Aucun rendez-vous ce jour." /> : (
          <div className="space-y-1.5">{list.map(r => (
            <button key={r.id} onClick={() => onOpen(r)} className="w-full card !rounded-xl p-3 text-left hover:bg-surface flex items-center gap-3 flex-wrap">
              <span className={`chip ${phaseColor(r.phase)}`}>{r.phase}</span>
              <span className="font-bold text-sm">{r.entreprise}</span>
              <span className="text-xs text-muted">{(r.contacts || []).map(c => c.nom).filter(Boolean).join(', ')}</span>
            </button>
          ))}</div>
        )
      })()}

      {mode === 'week' && (() => {
        const start = new Date(cursor); start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
        const days = [...Array(7)].map((_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d })
        return (
          <div className="grid grid-cols-7 gap-1.5">
            {days.map(d => {
              const k = dayISO(d)
              const list = rdvs.filter(r => r.dateRdv === k)
              return (
                <div key={k} className={`min-h-[8rem] rounded-lg border p-1.5 ${k === today ? 'border-brand bg-brand/5' : 'border-line bg-surface/50'}`}>
                  <div className={`text-[11px] font-bold mb-1 ${k === today ? 'text-brand' : 'text-muted'}`}>
                    {d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}
                  </div>
                  {list.map(r => <RdvPill key={r.id} r={r} onOpen={onOpen} />)}
                </div>
              )
            })}
          </div>
        )
      })()}

      {mode === 'month' && (() => {
        const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
        const startOffset = (first.getDay() + 6) % 7
        const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
        const cells = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
        const iso = (d) => `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        return (<>
          <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold text-muted mb-1">
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((d, i) => {
              if (!d) return <div key={'e' + i} />
              const dayRdvs = rdvs.filter(r => r.dateRdv === iso(d))
              return (
                <div key={d} className={`min-h-[4.5rem] rounded-lg border p-1 text-left ${iso(d) === today ? 'border-brand bg-brand/5' : 'border-line bg-surface/50'}`}>
                  <div className={`text-[11px] font-bold ${iso(d) === today ? 'text-brand' : 'text-muted'}`}>{d}</div>
                  {dayRdvs.map(r => <RdvPill key={r.id} r={r} onOpen={onOpen} />)}
                </div>
              )
            })}
          </div>
        </>)
      })()}

      {mode === 'year' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {[...Array(12)].map((_, m) => {
            const prefix = `${cursor.getFullYear()}-${String(m + 1).padStart(2, '0')}`
            const count = rdvs.filter(r => (r.dateRdv || '').startsWith(prefix)).length
            const label = new Date(cursor.getFullYear(), m, 1).toLocaleDateString('fr-FR', { month: 'long' })
            return (
              <button key={m} onClick={() => { setCursor(new Date(cursor.getFullYear(), m, 1)); setMode('month') }}
                className="rounded-xl border border-line bg-surface/50 hover:border-brand p-3 text-left">
                <div className="font-bold text-sm capitalize">{label}</div>
                <div className={`text-2xl font-extrabold ${count ? 'text-brand' : 'text-muted'}`}>{count}</div>
                <div className="text-[11px] text-muted">RDV</div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Page
export default function Rdv({ pendingNote, onPendingNoteUsed }) {
  const store = useStore()
  const sub = store.sub
  const [form, setForm] = useState(pendingNote ? { mode: 'create', data: { ...emptyForm(), notes: pendingNote } } : null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [sqlAsk, setSqlAsk] = useState(null) // {rdvId, patch, date}
  const [motifAsk, setMotifAsk] = useState(null) // {rdvId, kind: 'ko'|'noshow', value} — rappel non bloquant
  const [dupConfirm, setDupConfirm] = useState(null) // {data, mode, id, dups} — validation anti-doublon
  const [openGroups, setOpenGroups] = useState({})
  const [menuFor, setMenuFor] = useState(null)
  const [fieldsModal, setFieldsModal] = useState(false)
  // Filtres
  const [fPhase, setFPhase] = useState('')
  const [fSource, setFSource] = useState('')
  const [fOpp, setFOpp] = useState('')
  const [fPoste, setFPoste] = useState('')
  const [fProv, setFProv] = useState('')
  const [sort, setSort] = useState('date-desc')
  const [dateCustom, setDateCustom] = useState({ start: '', end: '' })
  const [view, setView] = useState('table') // 'table' | 'calendar'

  React.useEffect(() => {
    if (pendingNote) {
      setForm({ mode: 'create', data: { ...emptyForm(), notes: pendingNote } })
      onPendingNoteUsed?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNote])

  // Empêche la suppression d'une valeur (phase/provenance/statut) encore utilisée par un RDV (micro 13)
  const usageField = { phases: 'phase', provenances: 'provenance', opportunites: 'opportunite' }
  const setSubList = (key, list) => {
    const field = usageField[key]
    if (field) {
      const removed = (sub[key] || []).filter(v => !list.includes(v))
      const stillUsed = removed.filter(v => sub.rdvs.some(r => r[field] === v))
      if (stillUsed.length) {
        toast(`Impossible de supprimer « ${stillUsed.join(', ')} » : valeur encore utilisée par des rendez-vous.`)
        list = [...list, ...stillUsed]
      }
    }
    store.setSub(d => ({ ...d, [key]: list }))
  }
  const visible = (k) => sub.fieldsConfig.find(c => c.key === k)?.visible !== false

  const saveRdv = (data, mode, id) => {
    // Canonise la casse du nom d'entreprise sur la première variante connue (évite les doublons kanban).
    const existing = sub.rdvs.find(r => companyKey(r.entreprise) === companyKey(data.entreprise))
    if (existing && existing.entreprise !== data.entreprise) data = { ...data, entreprise: existing.entreprise }
    // Validation anti-doublon de contact (bug 3) : on demande confirmation avant de fusionner/ajouter.
    if (mode === 'create' || mode === 'sub') {
      const dups = findContactDuplicates(sub, { ...data, entreprise: data.entreprise })
      if (dups.length && !data.__dupConfirmed) {
        setDupConfirm({ data, mode, id, dups })
        return
      }
    }
    if (data.__dupConfirmed) { const { __dupConfirmed, ...clean } = data; data = clean }
    store.setSub(d => {
      if (mode === 'create' || mode === 'sub') {
        const rdv = {
          ...data, id: uid(), parentId: mode === 'sub' ? id : null,
          opportunite: data.opportunite || 'En cours', createdAt: todayISO(),
          history: [{ type: 'phase', value: data.phase, date: data.datePriseRdv || todayISO() }],
        }
        d.rdvs.push(rdv)
        syncContacts(d, rdv)
        ensurePrimeSnapshot(d, rdv)
      } else {
        const r = d.rdvs.find(x => x.id === id)
        Object.assign(r, applyRdvAutomations(r, data))
        syncContacts(d, r)
        ensurePrimeSnapshot(d, r)
      }
      return d
    })
    store.logAction('RDV', mode === 'edit' ? 'RDV modifié' : mode === 'sub' ? 'RDV suivant créé' : 'RDV créé', data.entreprise)
    toast(mode === 'edit' ? 'Rendez-vous modifié' : 'Rendez-vous créé')
    const before = mode === 'edit' ? (sub.rdvs.find(r => r.id === id) || {}) : {}
    celebrateIfSigned(before, data.phase, data.opportunite, data.entreprise)
    setForm(null)
  }

  const patchRdv = (rdv, patch) => {
    if (rdvNeedsSqlDate(rdv, patch)) {
      setSqlAsk({ rdvId: rdv.id, patch, date: todayISO() })
      return
    }
    store.setSub(d => {
      const r = d.rdvs.find(x => x.id === rdv.id)
      Object.assign(r, applyRdvAutomations(r, patch))
      ensurePrimeSnapshot(d, r)
      return d
    })
    const what = Object.entries(patch).map(([k, v]) => `${k} → ${v}`).join(', ')
    store.logAction('RDV', 'Champ modifié', `${rdv.entreprise} : ${what}`)
    celebrateIfSigned(rdv, patch.phase ?? rdv.phase, patch.opportunite ?? rdv.opportunite, rdv.entreprise)
    // Rappels non bloquants : motif de perte / raison du no-show
    if (patch.opportunite === 'Perdue' && !rdv.motifKo) setMotifAsk({ rdvId: rdv.id, kind: 'ko', value: '' })
    if ((patch.opportunite === 'No Show R1' || patch.opportunite === 'No Show MQL') && !rdv.motifNoShow) setMotifAsk({ rdvId: rdv.id, kind: 'noshow', value: '' })
  }

  const confirmSqlDate = () => {
    const { rdvId, patch, date, effectif } = sqlAsk
    const before = sub.rdvs.find(x => x.id === rdvId) || {}
    store.setSub(d => {
      const r = d.rdvs.find(x => x.id === rdvId)
      const extra = { ...patch, datePassageSQL: date }
      if (effectif) extra.effectif = effectif
      Object.assign(r, applyRdvAutomations(r, extra))
      ensurePrimeSnapshot(d, r) // fige la prime au barème du jour (versionnage)
      return d
    })
    store.logAction('RDV', 'Passage en SQL', `le ${date}`)
    toast('Passage en SQL enregistré — prime déclenchée')
    celebrateIfSigned(before, patch.phase ?? before.phase, patch.opportunite ?? before.opportunite, before.entreprise)
    setSqlAsk(null)
  }

  const deleteRdv = (id) => {
    // Suppression douce : le RDV (et ses suites) part en corbeille, restaurable 30 jours.
    const family = sub.rdvs.filter(x => x.id === id || x.parentId === id)
    const deletedAt = new Date().toISOString()
    store.setSub(d => ({
      ...d,
      rdvs: d.rdvs.filter(x => x.id !== id && x.parentId !== id),
      rdvTrash: [...(d.rdvTrash || []), ...family.map(r => ({ ...r, deletedAt }))],
    }))
    store.logAction('RDV', 'RDV mis à la corbeille', family[0]?.entreprise || '')
    toast('Rendez-vous mis à la corbeille (restaurable 30 jours)')
    setConfirmDel(null)
  }

  // ---- filtrage / tri
  // Prédicat appliqué à un RDV unitaire (réutilisé pour la racine ET les sous-RDV — micro 12)
  const rdvMatches = (x) =>
    (!fPhase || x.phase === fPhase) &&
    (!fSource || x.source === fSource) &&
    (!fOpp || x.opportunite === fOpp) &&
    (!fPoste || (x.contacts || []).some(c => c.poste === fPoste)) &&
    (!fProv || x.provenance === fProv) &&
    (sort !== 'date-custom' || inTimeline(x.dateRdv, 'custom', dateCustom))
  const anyFilter = fPhase || fSource || fOpp || fPoste || fProv || sort === 'date-custom'
  // Renvoie les sous-RDV à afficher (filtrés si un filtre est actif)
  const childrenOf = (r) => {
    const kids = sub.rdvs.filter(x => x.parentId === r.id)
    return anyFilter ? kids.filter(rdvMatches) : kids
  }
  const roots = useMemo(() => {
    let list = sub.rdvs.filter(r => !r.parentId)
    const matches = (r) => [r, ...sub.rdvs.filter(x => x.parentId === r.id)].some(rdvMatches)
    list = list.filter(matches)
    const cmp = {
      'date-desc': (a, b) => (b.dateRdv || '').localeCompare(a.dateRdv || ''),
      'date-asc': (a, b) => (a.dateRdv || '').localeCompare(b.dateRdv || ''),
      'date-custom': (a, b) => (b.dateRdv || '').localeCompare(a.dateRdv || ''),
      'eff-asc': (a, b) => (Number(a.effectif) || 0) - (Number(b.effectif) || 0),
      'eff-desc': (a, b) => (Number(b.effectif) || 0) - (Number(a.effectif) || 0),
      'contact-az': (a, b) => (a.contacts?.[0]?.nom || '').localeCompare(b.contacts?.[0]?.nom || ''),
      'contact-za': (a, b) => (b.contacts?.[0]?.nom || '').localeCompare(a.contacts?.[0]?.nom || ''),
    }[sort]
    return [...list].sort(cmp)
  }, [sub.rdvs, fPhase, fSource, fOpp, fPoste, fProv, sort, dateCustom])

  const allPostes = [...new Set(sub.rdvs.flatMap(r => (r.contacts || []).map(c => c.poste)).filter(Boolean))]

  const colCount = ['source', 'phase', 'opportunite', 'effectif', 'contact', 'poste', 'email', 'tel', 'dateRdv', 'datePriseRdv', 'provenance', 'notes'].filter(visible).length + 2

  const Row = ({ r, isChild, childCount }) => (
    <tr className={`border-t border-line hover:bg-surface/60 ${isChild ? 'bg-surface/40' : ''}`}>
      <td className="py-2 pl-3">
        {!isChild && childCount > 0 && (
          <button onClick={() => setOpenGroups(g => ({ ...g, [r.id]: !g[r.id] }))} className="flex items-center gap-1 font-bold text-brand">
            {openGroups[r.id] ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            <span className="text-xs">{childCount + 1}</span>
          </button>
        )}
        {isChild && <CornerDownRight size={14} className="text-muted ml-3" />}
      </td>
      {visible('source') && <td className="py-2">
        <Select value={r.source} onChange={v => patchRdv(r, { source: v })} options={SOURCES} className="!w-auto !py-1 text-xs" />
      </td>}
      {visible('phase') && <td>
        <select className={`chip border-0 cursor-pointer ${phaseColor(r.phase)}`} value={r.phase}
          onChange={e => patchRdv(r, { phase: e.target.value })}>
          {sub.phases.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </td>}
      {visible('opportunite') && <td>
        <select className={`chip border-0 cursor-pointer ${oppColor(r.opportunite)}`} value={r.opportunite}
          onChange={e => patchRdv(r, { opportunite: e.target.value })}>
          {sub.opportunites.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </td>}
      <td><button className="font-semibold hover:text-brand hover:underline text-left" title="Ouvrir la fiche entreprise" onClick={() => openCompany(r.entreprise)}>{r.entreprise}</button></td>
      {visible('effectif') && <td className="text-center">{r.effectif || '—'}</td>}
      {visible('contact') && <td>{(r.contacts || []).map(c => c.nom).filter(Boolean).join(', ') || '—'}</td>}
      {visible('poste') && <td className="text-muted">{(r.contacts || []).map(c => c.poste).filter(Boolean).join(', ') || '—'}</td>}
      {visible('email') && <td className="text-muted text-xs">{r.contacts?.[0]?.email || '—'}</td>}
      {visible('tel') && <td className="text-muted text-xs">{r.contacts?.[0]?.tel || '—'}</td>}
      {visible('dateRdv') && <td>{fmtDate(r.dateRdv)}</td>}
      {visible('datePriseRdv') && <td className="text-muted">{fmtDate(r.datePriseRdv)}</td>}
      {visible('provenance') && <td>{r.provenance}</td>}
      {visible('notes') && <td className="max-w-[10rem] truncate text-muted text-xs" title={r.notes}>{r.notes || '—'}</td>}
      <td className="relative pr-2">
        <button className="p-1.5 rounded-lg hover:bg-surface" onClick={() => setMenuFor(menuFor === r.id ? null : r.id)}>
          <MoreVertical size={16} />
        </button>
        {menuFor === r.id && (
          <div className="absolute right-2 top-9 z-30 card shadow-lg p-1 w-52 text-sm">
            <button className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-surface" onClick={() => { setMenuFor(null); setForm({ mode: 'edit', id: r.id, data: { ...r } }) }}>Modifier</button>
            {!isChild && <button className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-surface"
              onClick={() => { setMenuFor(null); setForm({ mode: 'sub', id: r.id, data: { ...r, id: undefined, phase: '', datePassageSQL: '', opportunite: 'En cours', datePriseRdv: todayISO(), dateRdv: '', contacts: r.contacts.map(c => ({ ...c, id: uid() })) } }) }}>
              Créer le rendez-vous suivant</button>}
            <button className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-surface text-red-500" onClick={() => { setMenuFor(null); setConfirmDel(r.id) }}>Supprimer</button>
          </div>
        )}
      </td>
    </tr>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-extrabold">Mes Rendez-vous</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-line overflow-hidden">
            <button className={`px-2.5 py-1.5 text-xs font-semibold flex items-center gap-1 ${view === 'table' ? 'bg-brand text-white' : 'bg-card text-muted'}`}
              onClick={() => setView('table')} title="Vue tableau"><TableIcon size={13} /> Tableau</button>
            <button className={`px-2.5 py-1.5 text-xs font-semibold flex items-center gap-1 ${view === 'calendar' ? 'bg-brand text-white' : 'bg-card text-muted'}`}
              onClick={() => setView('calendar')} title="Vue calendrier"><CalendarDays size={13} /> Calendrier</button>
          </div>
          <button className="btn-ghost text-xs" title="Modifier les champs" onClick={() => setFieldsModal(true)}><Settings2 size={15} /> Modifier les champs</button>
          <button className="btn-primary" onClick={() => setForm({ mode: 'create', data: emptyForm() })}><Plus size={16} /> Créer un RDV</button>
        </div>
      </div>

      {view === 'calendar' && (
        <CalendarView rdvs={sub.rdvs} onOpen={(r) => setForm({ mode: 'edit', id: r.id, data: { ...r } })} />
      )}

      {view === 'table' && <>
      <div className="card p-3 flex items-center gap-2 flex-wrap text-xs">
        <Select value={fSource} onChange={setFSource} options={SOURCES} placeholder="Source : toutes" className="!w-auto !py-1.5" />
        <Select value={fPhase} onChange={setFPhase} options={sub.phases} placeholder="Phase : toutes" className="!w-auto !py-1.5" />
        <Select value={fOpp} onChange={setFOpp} options={sub.opportunites} placeholder="Opportunité : toutes" className="!w-auto !py-1.5" />
        <Select value={fPoste} onChange={setFPoste} options={allPostes} placeholder="Poste : tous" className="!w-auto !py-1.5" />
        <Select value={fProv} onChange={setFProv} options={sub.provenances} placeholder="Provenance : toutes" className="!w-auto !py-1.5" />
        <select className="input !w-auto !py-1.5" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="date-desc">Date RDV : la plus récente</option>
          <option value="date-asc">Date RDV : la plus ancienne</option>
          <option value="date-custom">Date RDV : période personnalisée</option>
          <option value="eff-asc">Effectif : croissant</option>
          <option value="eff-desc">Effectif : décroissant</option>
          <option value="contact-az">Contact : A → Z</option>
          <option value="contact-za">Contact : Z → A</option>
        </select>
        {sort === 'date-custom' && <>
          <input type="date" className="input !w-auto !py-1" value={dateCustom.start} onChange={e => setDateCustom(c => ({ ...c, start: e.target.value }))} />
          <span>→</span>
          <input type="date" className="input !w-auto !py-1" value={dateCustom.end} onChange={e => setDateCustom(c => ({ ...c, end: e.target.value }))} />
        </>}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr className="text-left text-xs text-muted uppercase tracking-wide">
              <th className="py-2.5 pl-3 w-12"></th>
              {visible('source') && <th>Source</th>}
              {visible('phase') && <th>Phase</th>}
              {visible('opportunite') && <th>Opportunité</th>}
              <th>Entreprise</th>
              {visible('effectif') && <th className="text-center">Effectif</th>}
              {visible('contact') && <th>Contact</th>}
              {visible('poste') && <th>Poste</th>}
              {visible('email') && <th>Email</th>}
              {visible('tel') && <th>Téléphone</th>}
              {visible('dateRdv') && <th>Date RDV</th>}
              {visible('datePriseRdv') && <th>Prise de RDV</th>}
              {visible('provenance') && <th>Provenance</th>}
              {visible('notes') && <th>Notes</th>}
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {roots.length === 0 && <tr><td colSpan={colCount}><Empty text="Aucun rendez-vous. Cliquez sur « Créer un RDV »." /></td></tr>}
            {roots.map(r => {
              const children = childrenOf(r)
              return (
                <React.Fragment key={r.id}>
                  <Row r={r} childCount={children.length} />
                  {openGroups[r.id] && children.map(c => <Row key={c.id} r={c} isChild />)}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      </>}

      {form && (
        <RdvForm
          title={form.mode === 'create' ? 'Créer un RDV' : form.mode === 'sub' ? 'Créer le rendez-vous suivant' : 'Modifier le RDV'}
          initial={form.data} sub={sub} setSubList={setSubList} isCreate={form.mode === 'create'}
          findOrgOwners={(name) => {
            const k = companyKey(name)
            return store.db.subenvs
              .filter(s => s.envId === store.session.envId && s.id !== store.session.subEnvId)
              .filter(s => (store.db.data[s.id]?.rdvs || []).some(r => companyKey(r.entreprise) === k))
              .map(s => `${s.prenom} ${s.nom}`)
          }}
          onSave={(data) => saveRdv(data, form.mode, form.id)}
          onClose={() => setForm(null)}
        />
      )}

      {confirmDel && (
        <Confirm message="Êtes-vous sûr de vouloir supprimer ce Rendez-vous ? Les rendez-vous suivants liés seront aussi supprimés."
          onYes={() => deleteRdv(confirmDel)} onNo={() => setConfirmDel(null)} />
      )}

      {sqlAsk && (() => {
        const rdv = sub.rdvs.find(x => x.id === sqlAsk.rdvId)
        const missingEff = rdv && !Number(rdv.effectif)
        return (
          <Modal title="Date de passage en SQL" onClose={() => setSqlAsk(null)}>
            <p className="text-sm text-muted mb-3">Ce rendez-vous passe en SQL. Renseignez la date de passage en SQL — c'est elle qui déclenche la prime.</p>
            <input type="date" className="input" value={sqlAsk.date} onChange={e => setSqlAsk(s => ({ ...s, date: e.target.value }))} />
            {missingEff && (
              <div className="mt-3 rounded-xl bg-amber-50 border border-amber-300 p-3">
                <p className="text-xs text-amber-800 font-semibold mb-2">⚠️ Effectif non renseigné : sans lui, aucune prime ne sera calculée pour ce SQL. Ajoutez-le maintenant :</p>
                <input type="number" className="input" placeholder="Nombre de collaborateurs"
                  value={sqlAsk.effectif || ''} onChange={e => setSqlAsk(s => ({ ...s, effectif: e.target.value }))} />
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn-ghost" onClick={() => setSqlAsk(null)}>Annuler</button>
              <button className="btn-primary" onClick={confirmSqlDate}>Valider</button>
            </div>
          </Modal>
        )
      })()}

      {dupConfirm && (
        <Modal title="Contact déjà existant" onClose={() => setDupConfirm(null)}>
          <p className="text-sm text-muted mb-3">Un ou plusieurs contacts de ce rendez-vous existent déjà dans votre répertoire :</p>
          <ul className="space-y-1 mb-4">
            {dupConfirm.dups.map((d, i) => (
              <li key={i} className="text-sm p-2 rounded-lg bg-surface">
                <b>{d.incoming.nom || d.incoming.email}</b>
                <span className="text-muted"> — déjà présent{d.existing.entreprise ? ` chez ${d.existing.entreprise}` : ''}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted mb-4">En confirmant, la fiche existante sera mise à jour avec les nouvelles informations (aucun doublon créé).</p>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setDupConfirm(null)}>Annuler</button>
            <button className="btn-primary" onClick={() => { const c = dupConfirm; setDupConfirm(null); saveRdv({ ...c.data, __dupConfirmed: true }, c.mode, c.id) }}>Confirmer l'ajout</button>
          </div>
        </Modal>
      )}

      {motifAsk && (
        <Modal title={motifAsk.kind === 'ko' ? 'Motif de la perte (recommandé)' : 'Raison du no-show (recommandé)'} onClose={() => setMotifAsk(null)}>
          <p className="text-sm text-muted mb-3">
            {motifAsk.kind === 'ko'
              ? 'Renseigner pourquoi ce lead est perdu permet d\'analyser vos raisons de perte. Vous pouvez passer.'
              : 'Renseigner la raison du no-show aide à distinguer un problème de qualification d\'un problème de confirmation. Vous pouvez passer.'}
          </p>
          <EditableSelect value={motifAsk.value} onChange={v => setMotifAsk(m => ({ ...m, value: v }))}
            options={motifAsk.kind === 'ko' ? (sub.lostReasons || []) : (sub.noShowReasons || [])}
            onOptionsChange={o => setSubList(motifAsk.kind === 'ko' ? 'lostReasons' : 'noShowReasons', o)}
            label="motifs" placeholder="Choisir un motif..." />
          <div className="flex justify-end gap-2 mt-4">
            <button className="btn-ghost" onClick={() => setMotifAsk(null)}>Passer</button>
            <button className="btn-primary" disabled={!motifAsk.value} onClick={() => {
              store.setSub(d => {
                const r = d.rdvs.find(x => x.id === motifAsk.rdvId)
                if (r) r[motifAsk.kind === 'ko' ? 'motifKo' : 'motifNoShow'] = motifAsk.value
                return d
              })
              store.logAction('RDV', motifAsk.kind === 'ko' ? 'Motif de perte renseigné' : 'Raison du no-show renseignée', motifAsk.value)
              setMotifAsk(null)
            }}>Enregistrer le motif</button>
          </div>
        </Modal>
      )}

      {fieldsModal && (
        <Modal title="Modifier les champs du formulaire" onClose={() => setFieldsModal(false)}>
          <p className="text-xs text-muted mb-3">Les champs décochés n'apparaissent plus dans le tableau ni dans le formulaire de création.</p>
          <div className="space-y-1.5">
            {RDV_FIELDS.map(f => {
              const cfg = sub.fieldsConfig.find(c => c.key === f.key) || { visible: true }
              const locked = ['phase', 'entreprise', 'provenance'].includes(f.key)
              return (
                <label key={f.key} className={`flex items-center gap-2 text-sm p-1.5 rounded-lg hover:bg-surface ${locked ? 'opacity-50' : 'cursor-pointer'}`}>
                  <input type="checkbox" checked={cfg.visible !== false} disabled={locked}
                    onChange={e => store.setSub(d => ({
                      ...d,
                      fieldsConfig: RDV_FIELDS.map(x => {
                        const cur = d.fieldsConfig.find(c => c.key === x.key)
                        return { key: x.key, visible: x.key === f.key ? e.target.checked : (cur ? cur.visible : true) }
                      }),
                    }))} />
                  {f.label}{locked && <span className="text-xs text-muted">(obligatoire)</span>}
                </label>
              )
            })}
          </div>
        </Modal>
      )}
    </div>
  )
}
