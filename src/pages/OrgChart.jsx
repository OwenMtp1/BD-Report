import React from 'react'
import { useStore } from '../store.jsx'
import { Empty } from '../ui.jsx'

export default function OrgChart({ onOpenProfile }) {
  const store = useStore()
  const session = store.session
  const env = store.db.environments.find(e => e.id === session.envId)
  const subs = store.db.subenvs.filter(s => s.envId === session.envId)
  const isManager = ['Manager', 'Administrateur', 'Fondateur'].includes(store.account.role)
  const accOf = (s) => store.db.accounts.find(a => a.id === s.ownerId)
  // Hiérarchie par manager : un espace est rattaché au manager (teamOf) de son propriétaire.
  const managerSubs = subs.filter(s => subs.some(x => accOf(x)?.teamOf === s.ownerId))
  const teamOfManager = (m) => subs.filter(s => accOf(s)?.teamOf === m.ownerId)
  const attached = new Set([...managerSubs.map(s => s.id), ...managerSubs.flatMap(m => teamOfManager(m).map(s => s.id))])
  const unattached = subs.filter(s => !attached.has(s.id))
  const services = [...new Set(unattached.map(s => s.service).filter(Boolean))]

  const PersonCard = ({ s, small }) => (
    <div className={`card p-4 text-center ${small ? 'w-40' : 'w-44'}`}>
      {s.photo
        ? <img src={s.photo} alt="" className="w-14 h-14 rounded-full object-cover mx-auto mb-2 border-2 border-brand/30" />
        : <div className="w-14 h-14 rounded-full bg-brand/15 text-brand font-extrabold flex items-center justify-center mx-auto mb-2 text-lg">
            {(s.prenom?.[0] || '') + (s.nom?.[0] || '')}
          </div>}
      <div className="font-bold text-sm">{s.prenom} {s.nom}</div>
      <div className="text-xs text-muted">{s.poste}</div>
      {isManager && (
        <button className="btn-ghost !py-1 text-xs mt-2 w-full justify-center" onClick={() => onOpenProfile(s)}>
          Afficher le profil
        </button>
      )}
    </div>
  )

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-extrabold">Organigramme — {env?.name}</h2>
      {subs.length === 0 && <Empty text="Aucun profil dans cet environnement." />}
      <div className="flex flex-col items-center gap-6">
        {env && (
          <div className="card px-6 py-3 text-center border-2 border-brand">
            {env.logo && <img src={env.logo} alt="" className="w-10 h-10 rounded-lg object-cover mx-auto mb-1" />}
            <div className="font-extrabold">{env.name}</div>
          </div>
        )}
        {/* Équipes hiérarchiques : manager au-dessus, son équipe en dessous */}
        {managerSubs.length > 0 && (
          <div className="flex flex-wrap justify-center gap-10 w-full">
            {managerSubs.map(m => (
              <div key={m.id} className="flex flex-col items-center gap-0">
                <PersonCard s={m} />
                <div className="w-px h-5 bg-line" />
                <div className="chip bg-brand/15 text-brand font-extrabold mb-3">Équipe de {m.prenom}</div>
                <div className="flex flex-wrap justify-center gap-3">
                  {teamOfManager(m).map(s => <PersonCard key={s.id} s={s} small />)}
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Espaces sans rattachement : regroupés par service */}
        <div className="flex flex-wrap justify-center gap-8 w-full">
          {services.map(service => (
            <div key={service} className="flex flex-col items-center gap-3">
              <div className="chip bg-brand/15 text-brand !text-sm !px-4 !py-1.5 font-extrabold">{service}</div>
              <div className="w-px h-4 bg-line" />
              <div className="flex flex-wrap justify-center gap-3">
                {unattached.filter(s => s.service === service).map(s => <PersonCard key={s.id} s={s} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
