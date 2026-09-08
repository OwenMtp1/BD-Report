import React, { useState } from 'react'
import { BookOpen, Plus, Pencil, Trash2, Search } from 'lucide-react'
import { useStore, uid, fmtDate, KB_CATEGORIES } from '../store.jsx'
import { Modal, Field, Empty, Confirm, toast } from '../ui.jsx'

function emptyArticle() { return { id: uid(), title: '', category: KB_CATEGORIES[0].id, content: '', keywords: '' } }

export default function KnowledgeBase() {
  const store = useStore()
  const articles = store.db.kbArticles || []
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [form, setForm] = useState(null) // {mode, data}
  const [confirmDel, setConfirmDel] = useState(null)

  const ql = q.trim().toLowerCase()
  // La recherche couvre aussi les mots-clés, comme côté client.
  const list = articles
    .filter(a => !cat || a.category === cat)
    .filter(a => !ql || (a.title + ' ' + a.category + ' ' + (a.keywords || '') + ' ' + a.content).toLowerCase().includes(ql))
  const cats = [...new Set(articles.map(a => a.category).filter(Boolean))]
  const countOf = (c) => articles.filter(a => a.category === c).length

  const save = (data) => {
    if (!data.title.trim()) { toast('Donnez un titre à l\'article.'); return }
    store.saveKbArticle(data)
    toast(form.mode === 'create' ? 'Article créé' : 'Article mis à jour')
    setForm(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-extrabold flex items-center gap-2"><BookOpen size={20} className="text-brand" /> Base de connaissances</h2>
        <button className="btn-primary" onClick={() => setForm({ mode: 'create', data: emptyArticle() })}><Plus size={16} /> Nouvel article</button>
      </div>
      <p className="text-xs text-muted -mt-2">Articles d'aide visibles par les clients dans leur onglet Support, rangés par catégorie et interrogeables par mot-clé.</p>

      {cats.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button className={`chip ${cat === '' ? 'bg-brand text-white' : 'bg-surface text-muted'}`} onClick={() => setCat('')}>
            Toutes ({articles.length})
          </button>
          {cats.map(c => (
            <button key={c} className={`chip ${cat === c ? 'bg-brand text-white' : 'bg-surface text-muted'}`} onClick={() => setCat(c)}>
              {c} ({countOf(c)})
            </button>
          ))}
        </div>
      )}

      <div className="card p-2 flex items-center gap-2">
        <Search size={15} className="text-muted ml-1" />
        <input className="input !py-1.5 border-0 !bg-transparent" placeholder="Rechercher un article…" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {list.length === 0 ? <Empty text="Aucun article. Créez-en un avec « Nouvel article »." /> : (
        <div className="space-y-2">
          {list.map(a => (
            <div key={a.id} className="card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold flex items-center gap-2">{a.title} <span className="chip bg-surface text-muted">{a.category}</span></div>
                  <p className="text-sm text-muted whitespace-pre-wrap mt-1 line-clamp-3">{a.content}</p>
                  <div className="text-[11px] text-muted mt-1">Maj le {fmtDate((a.updatedAt || a.createdAt || '').slice(0, 10))}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button className="p-1.5 rounded-lg hover:bg-surface" onClick={() => setForm({ mode: 'edit', data: { ...a } })}><Pencil size={14} /></button>
                  <button className="p-1.5 rounded-lg hover:bg-surface text-red-500" onClick={() => setConfirmDel(a.id)}><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <Modal title={form.mode === 'create' ? 'Nouvel article' : 'Modifier l\'article'} onClose={() => setForm(null)} wide>
          <ArticleForm initial={form.data} categories={cats} onSave={save} onClose={() => setForm(null)} />
        </Modal>
      )}
      {confirmDel && <Confirm message="Supprimer cet article ?" onYes={() => { store.deleteKbArticle(confirmDel); setConfirmDel(null); toast('Article supprimé') }} onNo={() => setConfirmDel(null)} />}
    </div>
  )
}

function ArticleForm({ initial, categories, onSave, onClose }) {
  const [a, setA] = useState(initial)
  const set = (k, v) => setA(x => ({ ...x, [k]: v }))
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Titre" required><input className="input" value={a.title} onChange={e => set('title', e.target.value)} autoFocus /></Field>
        <Field label="Catégorie">
          <input className="input" list="kb-cats" value={a.category} onChange={e => set('category', e.target.value)} />
          <datalist id="kb-cats">
            {[...new Set([...KB_CATEGORIES.map(c => c.id), ...categories])].map(c => <option key={c} value={c} />)}
          </datalist>
        </Field>
      </div>
      <Field label="Mots-clés de recherche">
        <input className="input" value={a.keywords || ''} onChange={e => set('keywords', e.target.value)}
          placeholder="Les mots que le client tapera, même absents du texte : facture, bug, lent…" />
      </Field>
      <Field label="Contenu"><textarea className="input min-h-[180px]" value={a.content} onChange={e => set('content', e.target.value)} placeholder="Rédigez l'article d'aide…" /></Field>
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn-primary" onClick={() => onSave(a)}>Enregistrer</button>
      </div>
    </div>
  )
}
