import React, { useState } from 'react'
import { Tag, Plus, Trash2, Pencil, Check, X, Users, User } from 'lucide-react'
import { useStore, BRICKS, uid } from '../store.jsx'
import { GRANTABLE_TABS } from '../nav.jsx'
import { Modal, Field, Confirm, Empty, toast } from '../ui.jsx'

// Groupe les onglets accordables par rubrique de navigation (auto : tout nouvel onglet apparaît).
const TAB_GROUPS = GRANTABLE_TABS.reduce((acc, t) => { (acc[t.group] = acc[t.group] || []).push(t); return acc }, {})

// Console staff : création / modification / suppression des offres proposées aux clients.
// Ce que le staff coche ici (briques, équipe, prix) définit directement ce que la page
// « Souscrire à une offre » affiche côté client.
function OfferForm({ initial, onSave, onClose }) {
  const [o, setO] = useState(initial)
  const set = (k, v) => setO(x => ({ ...x, [k]: v }))
  const toggleBrick = (b) => setO(x => ({ ...x, bricks: x.bricks.includes(b) ? x.bricks.filter(y => y !== b) : [...x.bricks, b] }))
  const allBricks = GRANTABLE_TABS.map(t => t.brick)
  const setAll = (on) => setO(x => ({ ...x, bricks: on ? [...new Set([...x.bricks, ...allBricks])] : [] }))
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Nom de l'offre" required><input className="input" value={o.name} onChange={e => set('name', e.target.value)} autoFocus /></Field>
        <Field label="Prix (€ / mois, 0 = gratuit)"><input type="number" className="input" value={o.price} onChange={e => set('price', e.target.value)} /></Field>
        <Field label="Libellé de prix affiché"><input className="input" value={o.priceLabel || ''} onChange={e => set('priceLabel', e.target.value)} placeholder="ex : Gratuit pendant la bêta" /></Field>
        <Field label="Sièges max (0 = illimité)"><input type="number" className="input" value={o.maxSeats} onChange={e => set('maxSeats', e.target.value)} /></Field>
      </div>
      <Field label="Description"><textarea className="input" rows={2} value={o.desc || ''} onChange={e => set('desc', e.target.value)} /></Field>
      <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
        <input type="checkbox" checked={!!o.team} onChange={e => set('team', e.target.checked)} />
        <Users size={15} className="text-brand" /> Offre équipe (pilotage, comptes multiples, manager)
      </label>
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-bold">Onglets inclus ({o.bricks.filter(b => allBricks.includes(b)).length}/{allBricks.length})</div>
          <div className="flex gap-2 text-xs">
            <button type="button" className="btn-ghost !py-0.5" onClick={() => setAll(true)}>Tout cocher</button>
            <button type="button" className="btn-ghost !py-0.5" onClick={() => setAll(false)}>Tout décocher</button>
          </div>
        </div>
        <div className="space-y-2.5">
          {Object.entries(TAB_GROUPS).map(([group, tabs]) => (
            <div key={group}>
              <div className="text-[11px] font-bold uppercase tracking-wide text-muted mb-1">{group}</div>
              <div className="flex flex-wrap gap-2">
                {tabs.map(t => (
                  <label key={t.brick} className={`chip cursor-pointer ${o.bricks.includes(t.brick) ? 'bg-brand text-white' : 'bg-surface text-muted border border-line'}`}>
                    <input type="checkbox" className="hidden" checked={o.bricks.includes(t.brick)} onChange={() => toggleBrick(t.brick)} /> {t.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button className="btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn-primary" onClick={() => { if (!o.name.trim()) { toast('Nommez l\'offre'); return } onSave(o) }}>Enregistrer</button>
      </div>
    </div>
  )
}

export default function OffersAdmin() {
  const store = useStore()
  const offers = store.offers()
  const [form, setForm] = useState(null) // {mode, data}
  const [confirmDel, setConfirmDel] = useState(null)

  const save = (data) => {
    if (form.mode === 'create') store.createOffer(data)
    else store.updateOffer(data.id, data)
    toast(form.mode === 'create' ? 'Offre créée' : 'Offre mise à jour')
    setForm(null)
  }
  const newOffer = () => ({ id: uid(), name: '', price: 0, priceLabel: '', desc: '', bricks: [...BRICKS], team: false, maxSeats: 0 })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-bold flex items-center gap-2"><Tag size={17} className="text-brand" /> Offres & abonnements</h3>
          <p className="text-xs text-muted -mt-0.5">Ce que vous définissez ici alimente en direct la page « Souscrire à une offre » des clients.</p>
        </div>
        <button className="btn-primary" onClick={() => setForm({ mode: 'create', data: newOffer() })}><Plus size={16} /> Nouvelle offre</button>
      </div>

      {offers.length === 0 && <Empty text="Aucune offre. Créez-en une." />}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {offers.map(o => (
          <div key={o.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-bold flex items-center gap-2">{o.name}
                  {o.team ? <span className="chip bg-brand/10 text-brand"><Users size={11} /> Équipe</span> : <span className="chip bg-surface text-muted"><User size={11} /> Solo</span>}
                  {o.builtin && <span className="chip bg-surface text-muted">par défaut</span>}
                </div>
                <div className="text-lg font-extrabold">{o.priceLabel || (o.price > 0 ? o.price + ' € / mois' : 'Gratuit')}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button className="p-1.5 rounded-lg hover:bg-surface" onClick={() => setForm({ mode: 'edit', data: structuredClone(o) })}><Pencil size={14} /></button>
                <button className="p-1.5 rounded-lg hover:bg-surface text-red-500" onClick={() => setConfirmDel(o)}><Trash2 size={14} /></button>
              </div>
            </div>
            {o.desc && <p className="text-xs text-muted mt-1">{o.desc}</p>}
            <div className="text-xs text-muted mt-2">{(o.bricks || []).length} brique(s) · {o.maxSeats > 0 ? `${o.maxSeats} siège(s)` : 'sièges illimités'}</div>
          </div>
        ))}
      </div>

      {form && (
        <Modal title={form.mode === 'create' ? 'Nouvelle offre' : 'Modifier l\'offre'} onClose={() => setForm(null)} wide>
          <OfferForm initial={form.data} onSave={save} onClose={() => setForm(null)} />
        </Modal>
      )}
      {confirmDel && (
        <Confirm message={`Supprimer l'offre « ${confirmDel.name} » ? Elle disparaîtra de la page de souscription des clients.`}
          onYes={() => { store.deleteOffer(confirmDel.id); setConfirmDel(null); toast('Offre supprimée') }} onNo={() => setConfirmDel(null)} />
      )}
    </div>
  )
}
