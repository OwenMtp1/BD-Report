import React, { useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, Copy, ShieldCheck, Search, TrendingDown, MessageSquareWarning } from 'lucide-react'
import { useStore, uid, todayISO, fmtDate, OBJECTION_FAMILIES } from '../store.jsx'
import { Modal, Field, Select, Empty, Confirm, toast } from '../ui.jsx'

// « Objections » — onglet de Mes notes.
// Les objections d'un marché se répètent ; une équipe qui les affronte pour la première fois à
// chaque appel réinvente une réponse moyenne. On les range par famille, avec LA réponse que le
// manager valide, et on compte celles qui reviennent : le compteur dit où porter le coaching.
// Le rapprochement avec les motifs de perte est volontairement explicite plutôt qu'automatique —
// deviner qu'un « Pas de budget » correspond à l'objection « prix » serait une supposition.

const familyChip = (f) => {
  const map = {
    Prix: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    Timing: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    Concurrent: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
    'Statu quo': 'bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300',
    Besoin: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    Autorité: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  }
  return map[f] || 'bg-surface text-muted'
}

const emptyObjection = (family = '') => ({
  id: uid(), family: family || OBJECTION_FAMILIES[0], objection: '', response: '', example: '',
  validated: false, used: 0, lastUsed: '', createdAt: todayISO(),
})

export default function Objections() {
  const store = useStore()
  const sub = store.sub
  const [q, setQ] = useState('')
  const [fFamily, setFFamily] = useState('')
  const [editing, setEditing] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  if (!sub) return null

  const list = sub.objections || []
  const families = sub.objectionFamilies?.length ? sub.objectionFamilies : OBJECTION_FAMILIES
  // Valider une réponse est un geste d'encadrement : c'est dire « c'est celle-ci qu'on utilise ».
  const canValidate = store.hasClientPerm('team.manage') || store.hasClientPerm('team.view')

  const setList = (fn) => store.setSub(d => ({ ...d, objections: fn(d.objections || []) }))

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return list
      .filter(o => !fFamily || o.family === fFamily)
      .filter(o => !ql || [o.objection, o.response, o.example, o.family].some(v => (v || '').toLowerCase().includes(ql)))
      .sort((a, b) => (b.used || 0) - (a.used || 0) || (a.objection || '').localeCompare(b.objection || ''))
  }, [list, q, fFamily])

  // Motifs de perte les plus fréquents : de quoi savoir quelles objections armer en priorité.
  const lostTop = useMemo(() => {
    const m = {}
    ;(sub.rdvs || []).forEach(r => { if (r.motifKo) m[r.motifKo] = (m[r.motifKo] || 0) + 1 })
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [sub.rdvs])

  const copy = (o) => {
    const txt = [o.response, o.example].filter(Boolean).join('\n\n')
    try { navigator.clipboard?.writeText(txt) } catch (e) { /* presse-papiers indisponible : le compteur reste juste */ }
    setList(l => l.map(x => x.id === o.id ? { ...x, used: (x.used || 0) + 1, lastUsed: todayISO() } : x))
    toast('Réponse copiée')
  }

  const save = () => {
    if (!editing.objection.trim()) return
    setList(l => {
      const i = l.findIndex(x => x.id === editing.id)
      if (i >= 0) { const n = [...l]; n[i] = editing; return n }
      return [...l, editing]
    })
    store.logAction('Objection', 'Objection enregistrée', editing.objection)
    toast('Objection enregistrée')
    setEditing(null)
  }

  return (
    <div className="space-y-4">
      <div className="card p-3 flex items-center gap-2 flex-wrap text-xs">
        <div className="flex items-center gap-2 rounded-lg bg-surface border border-line px-2 flex-1 min-w-[200px]">
          <Search size={14} className="text-muted shrink-0" />
          <input className="input !py-1.5 border-0 !bg-transparent text-sm" placeholder="Chercher une objection, une réponse…"
            value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={fFamily} onChange={setFFamily} options={families} placeholder="Famille : toutes" className="!w-auto !py-1.5" />
        <button className="btn-primary !py-1.5 text-xs" onClick={() => setEditing(emptyObjection(fFamily))}>
          <Plus size={14} /> Ajouter une objection
        </button>
      </div>

      {lostTop.length > 0 && (
        <div className="card p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <TrendingDown size={15} className="text-amber-600" />
            <span className="font-bold text-sm">Ce qui vous fait perdre en ce moment</span>
          </div>
          <p className="text-[11px] text-muted mb-2">Vos motifs de perte les plus fréquents. Chacun mérite une réponse écrite plutôt qu'improvisée.</p>
          <div className="flex flex-wrap gap-1.5">
            {lostTop.map(([motif, n]) => (
              <button key={motif} className="chip bg-surface text-muted hover:bg-brand/10 hover:text-brand"
                title="Créer une objection à partir de ce motif"
                onClick={() => setEditing({ ...emptyObjection(), objection: motif })}>
                {motif} · {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0
        ? <Empty text={list.length === 0
          ? "Aucune objection enregistrée. Commencez par celle que vous entendez le plus souvent."
          : "Aucune objection ne correspond à cette recherche."} />
        : (
          <div className="space-y-2">
            {filtered.map(o => (
              <div key={o.id} className="card p-3.5">
                <div className="flex items-start gap-2 flex-wrap">
                  <span className={`chip ${familyChip(o.family)}`}>{o.family}</span>
                  <span className="font-bold text-[15px] flex-1 min-w-0">« {o.objection} »</span>
                  {o.validated && (
                    <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 flex items-center gap-1">
                      <ShieldCheck size={11} /> validée
                    </span>
                  )}
                  {(o.used || 0) > 0 && (
                    <span className="text-[11px] text-muted" title={o.lastUsed ? `Dernière fois le ${fmtDate(o.lastUsed)}` : ''}>
                      utilisée {o.used} fois
                    </span>
                  )}
                </div>
                {o.response && <p className="text-sm mt-2 whitespace-pre-wrap">{o.response}</p>}
                {o.example && <p className="text-xs text-muted mt-1.5 italic whitespace-pre-wrap">{o.example}</p>}
                <div className="flex gap-1.5 mt-2.5 flex-wrap">
                  <button className="btn-ghost !py-1 text-xs" onClick={() => copy(o)}><Copy size={13} /> Copier la réponse</button>
                  {canValidate && (
                    <button className="btn-ghost !py-1 text-xs" onClick={() => {
                      setList(l => l.map(x => x.id === o.id ? { ...x, validated: !x.validated } : x))
                      toast(o.validated ? 'Validation retirée' : 'Réponse validée pour l\'équipe')
                    }}><ShieldCheck size={13} /> {o.validated ? 'Retirer la validation' : 'Valider la réponse'}</button>
                  )}
                  <button className="btn-ghost !py-1 text-xs" onClick={() => setEditing({ ...o })}><Pencil size={13} /> Modifier</button>
                  <button className="btn-ghost !py-1 text-xs !text-red-600" onClick={() => setConfirmDel(o.id)}><Trash2 size={13} /> Supprimer</button>
                </div>
              </div>
            ))}
          </div>
        )}

      {editing && (
        <Modal title={list.some(x => x.id === editing.id) ? "Modifier l'objection" : 'Nouvelle objection'} onClose={() => setEditing(null)} wide>
          <div className="space-y-3">
            <Field label="Famille">
              <Select value={editing.family} onChange={v => setEditing(x => ({ ...x, family: v }))} options={families} />
            </Field>
            <Field label="Objection, telle qu'elle est dite" required>
              <input className="input" value={editing.objection} placeholder="Ex. On a déjà un outil"
                onChange={e => setEditing(x => ({ ...x, objection: e.target.value }))} />
            </Field>
            <Field label="Réponse">
              <textarea className="input min-h-[110px]" value={editing.response} placeholder="Ce qu'on répond, et pourquoi."
                onChange={e => setEditing(x => ({ ...x, response: e.target.value }))} />
            </Field>
            <Field label="Exemple de formulation">
              <textarea className="input min-h-[70px]" value={editing.example} placeholder="La phrase telle qu'on la dit au téléphone."
                onChange={e => setEditing(x => ({ ...x, example: e.target.value }))} />
            </Field>
            {canValidate && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={!!editing.validated} onChange={e => setEditing(x => ({ ...x, validated: e.target.checked }))} />
                Réponse validée pour l'équipe
              </label>
            )}
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setEditing(null)}>Annuler</button>
              <button className="btn-primary" disabled={!editing.objection.trim()} onClick={save}>Enregistrer</button>
            </div>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <Confirm message="Supprimer cette objection de la bibliothèque ?" yesLabel="Supprimer"
          onYes={() => { setList(l => l.filter(x => x.id !== confirmDel)); setConfirmDel(null); toast('Objection supprimée') }}
          onNo={() => setConfirmDel(null)} />
      )}

      {list.length > 0 && (
        <p className="text-[11px] text-muted flex items-center gap-1.5">
          <MessageSquareWarning size={12} /> Le compteur « utilisée » monte à chaque copie : il désigne les objections à travailler en réunion.
        </p>
      )}
    </div>
  )
}
