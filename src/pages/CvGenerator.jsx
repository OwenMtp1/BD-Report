import React, { useMemo, useRef, useState } from 'react'
import {
  User, Mail, FileText, Briefcase, GraduationCap, Sparkles, Languages, Heart, Share2, Wand2,
  Plus, Trash2, ArrowLeft, ArrowRight, Save, Download, Image as ImageIcon, Check, Pencil,
  LayoutTemplate, FilePlus2, Copy, Palette, X,
} from 'lucide-react'
import { useStore, uid, fmtDate, todayISO } from '../store.jsx'
import { Field, Select, Modal, Confirm, Empty, toast } from '../ui.jsx'
import { STEPS, emptyAnswers, LANG_LEVELS } from '../cv/questionnaire.js'
import { DESIGNS, designById, matchDesigns } from '../cv/designs.js'
import CvDocument, { A4_W, A4_H } from '../cv/CvDocument.jsx'
import { exportPDF, exportJPG } from '../cv/export.js'

const STEP_ICONS = { User, Mail, FileText, Briefcase, GraduationCap, Sparkles, Languages, Heart, Share2, Wand2 }

// Écriture immuable par chemin en pointillé. Chemin spécial « __name » → prénom/nom.
function setIn(obj, path, value) {
  if (path === '__name') {
    const parts = String(value || '').trim().split(/\s+/)
    return { ...obj, prenom: parts[0] || '', nom: parts.slice(1).join(' ') }
  }
  const keys = path.split('.')
  const clone = Array.isArray(obj) ? [...obj] : { ...obj }
  let cur = clone
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    cur[k] = Array.isArray(cur[k]) ? [...cur[k]] : { ...(cur[k] || {}) }
    cur = cur[k]
  }
  cur[keys[keys.length - 1]] = value
  return clone
}

const newDraft = () => ({ id: uid(), name: '', answers: emptyAnswers(), designId: null, createdAt: todayISO(), updatedAt: todayISO() })

// Vignette d'aperçu d'un design (CvDocument réduit).
function Thumb({ design, answers, w = 172 }) {
  const s = w / A4_W
  return (
    <div style={{ width: w, height: A4_H * s, overflow: 'hidden', borderRadius: 8, border: '1px solid #e6e8ec', background: '#fff', pointerEvents: 'none' }}>
      <div style={{ transform: `scale(${s})`, transformOrigin: 'top left', width: A4_W }}>
        <CvDocument design={design} answers={answers} editable={false} />
      </div>
    </div>
  )
}

export default function CvGenerator() {
  const store = useStore()
  const cvs = store.sub?.cvs || []
  const [view, setView] = useState('bank') // bank | wizard
  const [draft, setDraft] = useState(newDraft)
  const [phase, setPhase] = useState('form') // form | match | editor
  const [step, setStep] = useState(0)
  const [confirm, setConfirm] = useState(null)

  const answers = draft.answers
  const design = draft.designId ? designById(draft.designId) : null

  // --- helpers d'édition du brouillon ---
  const setAnswers = (fn) => setDraft(d => ({ ...d, answers: fn(d.answers), updatedAt: todayISO() }))
  const onField = (path, value) => setAnswers(a => setIn(a, path, value))
  const setField = (key, value) => setAnswers(a => ({ ...a, [key]: value }))

  const startNew = () => { setDraft(newDraft()); setPhase('form'); setStep(0); setView('wizard') }
  const openCv = (cv) => { setDraft({ ...cv, answers: { ...emptyAnswers(), ...cv.answers } }); setPhase('editor'); setView('wizard') }

  const persist = (d = draft) => {
    const name = d.name || [d.answers.prenom, d.answers.nom].filter(Boolean).join(' ') || 'CV sans titre'
    const rec = { ...d, name, updatedAt: todayISO() }
    store.setSub(data => {
      const list = data.cvs || []
      const idx = list.findIndex(x => x.id === rec.id)
      const next = idx >= 0 ? list.map(x => (x.id === rec.id ? rec : x)) : [...list, rec]
      return { ...data, cvs: next }
    })
    setDraft(rec)
    return rec
  }

  const removeCv = (id) => {
    store.setSub(data => ({ ...data, cvs: (data.cvs || []).filter(x => x.id !== id) }))
    toast('CV supprimé')
  }
  const duplicateCv = (cv) => {
    const copy = { ...cv, id: uid(), name: (cv.name || 'CV') + ' (copie)', createdAt: todayISO(), updatedAt: todayISO() }
    store.setSub(data => ({ ...data, cvs: [...(data.cvs || []), copy] }))
    toast('CV dupliqué')
  }

  // ---------------------------------------------------------------- Banque de CV
  if (view === 'bank') {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-ink flex items-center gap-2"><LayoutTemplate size={24} className="text-brand" /> Générateur de CV</h1>
            <p className="text-sm text-muted mt-1">Répondez au questionnaire, choisissez un design parmi 50 modèles, puis exportez votre CV.</p>
          </div>
          <button className="btn-primary" onClick={startNew}><FilePlus2 size={16} /> Nouveau CV</button>
        </div>

        {cvs.length === 0 ? (
          <div className="card p-10 text-center">
            <LayoutTemplate size={40} className="mx-auto text-brand mb-3" />
            <div className="font-bold text-ink">Votre banque de CV est vide</div>
            <p className="text-sm text-muted mt-1 mb-4">Créez votre premier CV en quelques minutes.</p>
            <button className="btn-primary mx-auto" onClick={startNew}><Plus size={16} /> Créer un CV</button>
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {cvs.map(cv => {
              const d = cv.designId ? designById(cv.designId) : DESIGNS[0]
              return (
                <div key={cv.id} className="card p-3 flex flex-col gap-3">
                  <div className="mx-auto"><Thumb design={d} answers={{ ...emptyAnswers(), ...cv.answers }} w={180} /></div>
                  <div>
                    <div className="font-bold text-ink text-sm truncate">{cv.name || 'CV sans titre'}</div>
                    <div className="text-xs text-muted">{d?.name} · maj {fmtDate(cv.updatedAt)}</div>
                  </div>
                  <div className="flex gap-1.5">
                    <button className="btn-primary flex-1 !px-2 !py-1.5 justify-center" onClick={() => openCv(cv)}><Pencil size={14} /> Éditer</button>
                    <button className="btn-ghost !px-2 !py-1.5" title="Dupliquer" onClick={() => duplicateCv(cv)}><Copy size={14} /></button>
                    <button className="btn-ghost !px-2 !py-1.5" title="Supprimer" onClick={() => setConfirm(cv.id)}><Trash2 size={14} className="text-red-500" /></button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {confirm && <Confirm message="Supprimer ce CV définitivement ?" onYes={() => { removeCv(confirm); setConfirm(null) }} onNo={() => setConfirm(null)} />}
      </div>
    )
  }

  // ---------------------------------------------------------------- Wizard
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button className="btn-ghost !px-2.5 !py-1.5" onClick={() => { setView('bank') }}><ArrowLeft size={16} /> Banque de CV</button>
        <div className="flex items-center gap-2 text-sm">
          <StepDot active={phase === 'form'} done={phase !== 'form'} label="1. Questionnaire" />
          <span className="text-line">—</span>
          <StepDot active={phase === 'match'} done={phase === 'editor'} label="2. Design" />
          <span className="text-line">—</span>
          <StepDot active={phase === 'editor'} label="3. Édition & export" />
        </div>
      </div>

      {phase === 'form' && (
        <Questionnaire step={step} setStep={setStep} answers={answers} setField={setField} setAnswers={setAnswers}
          onFinish={() => setPhase('match')} />
      )}

      {phase === 'match' && (
        <DesignPicker answers={answers} currentId={draft.designId}
          onBack={() => setPhase('form')}
          onPick={(id) => { const rec = persist({ ...draft, designId: id, name: draft.name || [answers.prenom, answers.nom].filter(Boolean).join(' ') }); setDraft(rec); setPhase('editor'); toast('Design appliqué 🎨') }} />
      )}

      {phase === 'editor' && design && (
        <Editor draft={draft} design={design} answers={answers} onField={onField} setAnswers={setAnswers}
          onRename={(name) => setDraft(d => ({ ...d, name }))}
          onChangeDesign={() => setPhase('match')}
          onSave={() => { persist(); toast('CV enregistré ✅') }}
          onDone={() => { persist(); setView('bank') }} />
      )}
    </div>
  )
}

function StepDot({ active, done, label }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold ${active ? 'text-brand' : done ? 'text-emerald-600' : 'text-muted'}`}>
      {done ? <Check size={14} /> : <span className={`w-2 h-2 rounded-full ${active ? 'bg-brand' : 'bg-line'}`} />}{label}
    </span>
  )
}

// ---------------------------------------------------------------- Questionnaire
function Questionnaire({ step, setStep, answers, setField, setAnswers, onFinish }) {
  const s = STEPS[step]
  const Icon = STEP_ICONS[s.icon] || FileText
  const last = step === STEPS.length - 1

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
      <div className="card p-5 max-w-3xl">
        <div className="flex items-center gap-2 mb-1">
          <Icon size={20} className="text-brand" />
          <h2 className="text-lg font-extrabold text-ink">{s.title}</h2>
          <span className="ml-auto text-xs text-muted font-semibold">Étape {step + 1}/{STEPS.length}</span>
        </div>
        <div className="h-1.5 rounded-full bg-surface mb-5 overflow-hidden">
          <div className="h-full bg-brand transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>

        {s.fields && (
          <div className="grid sm:grid-cols-2 gap-3">
            {s.fields.map(f => (
              <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                <FieldInput f={f} value={answers[f.key]} onChange={v => setField(f.key, v)} />
              </div>
            ))}
          </div>
        )}

        {s.list && <ListEditor listKey={s.list} itemLabel={s.itemLabel} fields={s.fields} answers={answers} setAnswers={setAnswers} />}

        {s.tags && <TagEditor tagKey={s.tags} placeholder={s.placeholder} answers={answers} setAnswers={setAnswers} />}

        <div className="flex justify-between mt-6">
          <button className="btn-ghost" disabled={step === 0} onClick={() => setStep(step - 1)} style={step === 0 ? { opacity: .4, cursor: 'not-allowed' } : {}}>
            <ArrowLeft size={16} /> Précédent
          </button>
          {last
            ? <button className="btn-primary" onClick={onFinish}><LayoutTemplate size={16} /> Choisir un design</button>
            : <button className="btn-primary" onClick={() => setStep(step + 1)}>Suivant <ArrowRight size={16} /></button>}
        </div>
      </div>
    </div>
  )
}

function FieldInput({ f, value, onChange }) {
  if (f.type === 'photo') return <PhotoInput value={value} onChange={onChange} />
  if (f.type === 'select') return <Field label={f.label}><Select value={value} onChange={onChange} options={f.options} placeholder="—" /></Field>
  if (f.type === 'textarea') return (
    <Field label={f.label} required={f.required}>
      <textarea className="input" rows={f.key === 'typeKeywords' ? 3 : 4} placeholder={f.placeholder} value={value || ''} onChange={e => onChange(e.target.value)} />
    </Field>
  )
  return (
    <Field label={f.label} required={f.required}>
      <input className="input" placeholder={f.placeholder} value={value || ''} onChange={e => onChange(e.target.value)} />
    </Field>
  )
}

function PhotoInput({ value, onChange }) {
  const ref = useRef(null)
  const pick = (file) => {
    if (!file) return
    const r = new FileReader()
    r.onload = () => onChange(r.result)
    r.readAsDataURL(file)
  }
  return (
    <Field label="Photo (optionnelle)">
      <div className="flex items-center gap-3">
        {value
          ? <img src={value} alt="" className="w-16 h-16 rounded-full object-cover border border-line" />
          : <div className="w-16 h-16 rounded-full bg-surface border border-line flex items-center justify-center text-muted"><ImageIcon size={20} /></div>}
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={e => pick(e.target.files?.[0])} />
        <button type="button" className="btn-ghost !py-1.5" onClick={() => ref.current?.click()}><ImageIcon size={14} /> Choisir</button>
        {value && <button type="button" className="btn-ghost !py-1.5" onClick={() => onChange('')}><X size={14} /> Retirer</button>}
      </div>
    </Field>
  )
}

// Éditeur de listes répétables (expériences, diplômes, langues, réseaux).
function ListEditor({ listKey, itemLabel, fields, answers, setAnswers }) {
  const items = answers[listKey] || []
  const add = () => setAnswers(a => ({ ...a, [listKey]: [...(a[listKey] || []), { id: uid() }] }))
  const update = (i, key, val) => setAnswers(a => ({ ...a, [listKey]: a[listKey].map((it, idx) => idx === i ? { ...it, [key]: val } : it) }))
  const remove = (i) => setAnswers(a => ({ ...a, [listKey]: a[listKey].filter((_, idx) => idx !== i) }))
  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="text-sm text-muted">Aucun élément pour le moment.</p>}
      {items.map((it, i) => (
        <div key={it.id || i} className="rounded-xl border border-line p-3 relative">
          <button className="absolute top-2 right-2 text-red-500 hover:bg-surface rounded p-1" onClick={() => remove(i)}><Trash2 size={14} /></button>
          <div className="grid sm:grid-cols-2 gap-3">
            {fields.map(f => (
              <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                <FieldInput f={f} value={it[f.key]} onChange={v => update(i, f.key, v)} />
              </div>
            ))}
          </div>
        </div>
      ))}
      <button className="btn-ghost" onClick={add}><Plus size={15} /> Ajouter {itemLabel === 'expérience' || itemLabel === 'langue' ? 'une' : 'un'} {itemLabel}</button>
    </div>
  )
}

// Éditeur d'étiquettes (compétences, centres d'intérêt).
function TagEditor({ tagKey, placeholder, answers, setAnswers }) {
  const [val, setVal] = useState('')
  const items = answers[tagKey] || []
  const add = () => { const v = val.trim(); if (!v) return; setAnswers(a => ({ ...a, [tagKey]: [...(a[tagKey] || []), v] })); setVal('') }
  const remove = (i) => setAnswers(a => ({ ...a, [tagKey]: a[tagKey].filter((_, idx) => idx !== i) }))
  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input className="input" placeholder={placeholder} value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <button className="btn-primary" onClick={add}><Plus size={16} /></button>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((t, i) => (
          <span key={i} className="chip bg-brand/10 text-brand">{t}
            <button onClick={() => remove(i)} className="ml-1 hover:text-red-500"><X size={12} /></button>
          </span>
        ))}
        {items.length === 0 && <span className="text-sm text-muted">Ajoutez vos {tagKey === 'competences' ? 'compétences' : "centres d'intérêt"}.</span>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Choix du design (matching)
function DesignPicker({ answers, currentId, onPick, onBack }) {
  const { scored, hasMatch, tokens } = useMemo(() => matchDesigns(answers.typeKeywords), [answers.typeKeywords])
  const [showAll, setShowAll] = useState(!hasMatch)
  const top = scored.filter(s => s.score > 0)
  const rest = scored.filter(s => s.score === 0)
  const previewAnswers = useMemo(() => ({ ...emptyAnswers(), ...answers }), [answers])

  const Card = ({ item }) => (
    <button className={`text-left rounded-xl border p-2 transition-shadow hover:shadow-md ${currentId === item.design.id ? 'border-brand ring-2 ring-brand/30' : 'border-line'}`}
      onClick={() => onPick(item.design.id)}>
      <div className="mx-auto"><Thumb design={item.design} answers={previewAnswers} w={168} /></div>
      <div className="mt-2 px-1">
        <div className="font-bold text-ink text-sm flex items-center gap-1.5">{item.design.name}
          {item.score > 0 && <span className="chip bg-emerald-100 text-emerald-700 !px-1.5 !py-0.5 text-[10px]">match</span>}</div>
        <div className="text-xs text-muted capitalize">{item.design.style}</div>
      </div>
    </button>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button className="btn-ghost !px-2.5 !py-1.5" onClick={onBack}><ArrowLeft size={16} /> Questionnaire</button>
        <h2 className="text-lg font-extrabold text-ink">Choisissez un design</h2>
      </div>

      {answers.typeKeywords ? (
        <div className="card p-3 text-sm flex items-start gap-2">
          <Wand2 size={16} className="text-brand mt-0.5 shrink-0" />
          <div>
            {hasMatch
              ? <>D'après vos mots-clés{tokens.length ? <> (<span className="font-semibold">{tokens.join(', ')}</span>)</> : ''}, voici les modèles recommandés. </>
              : <>Aucun modèle ne correspond exactement à « <span className="font-semibold">{answers.typeKeywords}</span> » — voici les <span className="font-semibold">plus proches</span> ci-dessous. </>}
            <button className="text-brand font-semibold hover:underline" onClick={() => setShowAll(v => !v)}>{showAll ? 'Masquer' : 'Voir'} les 50 modèles</button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">Parcourez les 50 modèles et cliquez sur celui qui vous plaît.</p>
      )}

      {hasMatch && top.length > 0 && (
        <div>
          <div className="label mb-2">Recommandés pour vous</div>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(184px, 1fr))' }}>
            {top.slice(0, 8).map(item => <Card key={item.design.id} item={item} />)}
          </div>
        </div>
      )}

      {(showAll || !hasMatch) && (
        <div>
          {hasMatch && <div className="label mb-2 mt-2">Tous les modèles</div>}
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(184px, 1fr))' }}>
            {(hasMatch ? rest : scored).map(item => <Card key={item.design.id} item={item} />)}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Éditeur + export
function Editor({ draft, design, answers, onField, setAnswers, onRename, onChangeDesign, onSave, onDone }) {
  const exportRef = useRef(null)
  const [busy, setBusy] = useState('')
  const [structOpen, setStructOpen] = useState(true)

  const doExport = async (kind) => {
    const node = exportRef.current?.firstChild
    if (!node) return
    setBusy(kind)
    try {
      const name = (draft.name || 'cv').replace(/[^\w\-À-ÿ ]+/g, '').trim() || 'cv'
      if (kind === 'pdf') await exportPDF(node, name)
      else await exportJPG(node, name)
      toast(kind === 'pdf' ? 'PDF exporté 📄' : 'Image exportée 🖼️')
    } catch (e) {
      toast("Échec de l'export : " + (e?.message || e))
    } finally { setBusy('') }
  }

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) 320px' }}>
      {/* Aperçu éditable */}
      <div className="min-w-0">
        <div className="card p-3 mb-3 flex items-center gap-2 flex-wrap">
          <input className="input max-w-xs" value={draft.name} placeholder="Nom du CV" onChange={e => onRename(e.target.value)} />
          <span className="text-xs text-muted">Cliquez directement sur le texte du CV pour le modifier.</span>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4 overflow-auto">
          <div className="mx-auto shadow-lg" style={{ width: A4_W }}>
            <CvDocument design={design} answers={answers} editable onField={onField} />
          </div>
        </div>
      </div>

      {/* Panneau latéral */}
      <div className="space-y-3">
        <div className="card p-3 space-y-2">
          <button className="btn-primary w-full justify-center" disabled={!!busy} onClick={() => doExport('pdf')}>
            <Download size={16} /> {busy === 'pdf' ? 'Export…' : 'Exporter en PDF'}
          </button>
          <button className="btn-ghost w-full justify-center" disabled={!!busy} onClick={() => doExport('jpg')}>
            <ImageIcon size={16} /> {busy === 'jpg' ? 'Export…' : 'Exporter en JPG'}
          </button>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1 justify-center" onClick={onSave}><Save size={15} /> Enregistrer</button>
            <button className="btn-ghost flex-1 justify-center" onClick={onDone}><Check size={15} /> Terminer</button>
          </div>
        </div>

        <div className="card p-3">
          <button className="btn-ghost w-full justify-center" onClick={onChangeDesign}><Palette size={15} /> Changer de design</button>
          <div className="text-xs text-muted text-center mt-1.5">Actuel : <span className="font-semibold">{design.name}</span></div>
        </div>

        <div className="card p-3">
          <button className="w-full flex items-center justify-between font-bold text-sm text-ink mb-1" onClick={() => setStructOpen(v => !v)}>
            <span>Contenu & sections</span>
            <ArrowRight size={15} className={`transition-transform ${structOpen ? 'rotate-90' : ''}`} />
          </button>
          {structOpen && <StructurePanel answers={answers} setAnswers={setAnswers} />}
        </div>
      </div>

      {/* Rendu hors-écran, pleine taille, pour l'export (sans styles d'édition) */}
      <div ref={exportRef} style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }} aria-hidden>
        <CvDocument design={design} answers={answers} editable={false} />
      </div>
    </div>
  )
}

// Panneau pour ajouter/supprimer les éléments structurels (le texte se modifie inline).
function StructurePanel({ answers, setAnswers }) {
  const addItem = (key) => setAnswers(a => ({ ...a, [key]: [...(a[key] || []), { id: uid() }] }))
  const removeItem = (key, i) => setAnswers(a => ({ ...a, [key]: a[key].filter((_, idx) => idx !== i) }))
  const updItem = (key, i, k, v) => setAnswers(a => ({ ...a, [key]: a[key].map((it, idx) => idx === i ? { ...it, [k]: v } : it) }))

  const [tag, setTag] = useState({ competences: '', interets: '' })
  const addTag = (key) => { const v = (tag[key] || '').trim(); if (!v) return; setAnswers(a => ({ ...a, [key]: [...(a[key] || []), v] })); setTag(t => ({ ...t, [key]: '' })) }
  const removeTag = (key, i) => setAnswers(a => ({ ...a, [key]: a[key].filter((_, idx) => idx !== i) }))

  const Group = ({ title, children }) => <div className="mt-3"><div className="label mb-1.5">{title}</div>{children}</div>

  return (
    <div className="text-sm">
      <Group title="Expériences">
        {(answers.experiences || []).map((it, i) => (
          <div key={it.id || i} className="flex items-center gap-1 mb-1">
            <span className="flex-1 truncate text-xs">{it.poste || 'Expérience'} {it.entreprise ? `· ${it.entreprise}` : ''}</span>
            <button className="text-red-500 p-0.5" onClick={() => removeItem('experiences', i)}><Trash2 size={13} /></button>
          </div>
        ))}
        <button className="btn-ghost !py-1 !text-xs w-full justify-center" onClick={() => addItem('experiences')}><Plus size={13} /> Ajouter</button>
      </Group>

      <Group title="Diplômes">
        {(answers.diplomes || []).map((it, i) => (
          <div key={it.id || i} className="flex items-center gap-1 mb-1">
            <span className="flex-1 truncate text-xs">{it.intitule || 'Diplôme'} {it.ecole ? `· ${it.ecole}` : ''}</span>
            <button className="text-red-500 p-0.5" onClick={() => removeItem('diplomes', i)}><Trash2 size={13} /></button>
          </div>
        ))}
        <button className="btn-ghost !py-1 !text-xs w-full justify-center" onClick={() => addItem('diplomes')}><Plus size={13} /> Ajouter</button>
      </Group>

      <Group title="Compétences">
        <div className="flex gap-1 mb-2">
          <input className="input !py-1 text-xs" placeholder="Compétence" value={tag.competences}
            onChange={e => setTag(t => ({ ...t, competences: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag('competences') } }} />
          <button className="btn-primary !px-2 !py-1" onClick={() => addTag('competences')}><Plus size={13} /></button>
        </div>
        <div className="flex flex-wrap gap-1">
          {(answers.competences || []).map((c, i) => <span key={i} className="chip bg-surface text-ink !py-0.5">{c}<button onClick={() => removeTag('competences', i)} className="ml-1 hover:text-red-500"><X size={11} /></button></span>)}
        </div>
      </Group>

      <Group title="Langues">
        {(answers.langues || []).map((it, i) => (
          <div key={it.id || i} className="flex items-center gap-1 mb-1">
            <input className="input !py-1 text-xs flex-1" placeholder="Langue" value={it.langue || ''} onChange={e => updItem('langues', i, 'langue', e.target.value)} />
            <select className="input !py-1 text-xs w-24" value={it.niveau || ''} onChange={e => updItem('langues', i, 'niveau', e.target.value)}>
              <option value="">Niveau</option>
              {LANG_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <button className="text-red-500 p-0.5" onClick={() => removeItem('langues', i)}><Trash2 size={13} /></button>
          </div>
        ))}
        <button className="btn-ghost !py-1 !text-xs w-full justify-center" onClick={() => addItem('langues')}><Plus size={13} /> Ajouter</button>
      </Group>

      <Group title="Centres d'intérêt">
        <div className="flex gap-1 mb-2">
          <input className="input !py-1 text-xs" placeholder="Centre d'intérêt" value={tag.interets}
            onChange={e => setTag(t => ({ ...t, interets: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag('interets') } }} />
          <button className="btn-primary !px-2 !py-1" onClick={() => addTag('interets')}><Plus size={13} /></button>
        </div>
        <div className="flex flex-wrap gap-1">
          {(answers.interets || []).map((c, i) => <span key={i} className="chip bg-surface text-ink !py-0.5">{c}<button onClick={() => removeTag('interets', i)} className="ml-1 hover:text-red-500"><X size={11} /></button></span>)}
        </div>
      </Group>

      <Group title="Réseaux sociaux">
        {(answers.reseaux || []).map((it, i) => (
          <div key={it.id || i} className="flex items-center gap-1 mb-1">
            <input className="input !py-1 text-xs w-20" placeholder="Réseau" value={it.label || ''} onChange={e => updItem('reseaux', i, 'label', e.target.value)} />
            <input className="input !py-1 text-xs flex-1" placeholder="Lien" value={it.url || ''} onChange={e => updItem('reseaux', i, 'url', e.target.value)} />
            <button className="text-red-500 p-0.5" onClick={() => removeItem('reseaux', i)}><Trash2 size={13} /></button>
          </div>
        ))}
        <button className="btn-ghost !py-1 !text-xs w-full justify-center" onClick={() => addItem('reseaux')}><Plus size={13} /> Ajouter</button>
      </Group>
    </div>
  )
}
