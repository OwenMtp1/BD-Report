// ---------------------------------------------------------------------------
//  Compte rendu d'un import CRM — partagé par HubSpot et Pipedrive.
//
//  ⚠️ Un import qui dit seulement « 120 lignes lues » ne sert à rien : la seule
//  question de l'utilisateur est « qu'est-ce qui a changé chez moi, et qu'est-ce qui
//  n'est PAS passé ». On rend donc quatre nombres par nature, puis nommément ce qui
//  a été écarté et ce qui diverge.
//
//  ⚠️ LES ÉCARTS SONT LE CŒUR. Le moteur ne remplace jamais une valeur saisie : il
//  la signale. Sans cette liste, ce refus d'écraser passerait pour un import qui
//  n'a rien fait — et quelqu'un finirait par demander qu'on écrase.
// ---------------------------------------------------------------------------
import React, { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'

const Bloc = ({ titre, o }) => (
  <div className="flex items-center gap-2 text-xs flex-wrap">
    <span className="font-semibold w-24 shrink-0">{titre}</span>
    {o.created > 0 && <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{o.created} créé(s)</span>}
    {o.completed > 0 && <span className="chip bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">{o.completed} complété(s)</span>}
    {o.unchanged > 0 && <span className="chip bg-surface text-muted">{o.unchanged} inchangé(s)</span>}
    {o.skipped > 0 && <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">{o.skipped} écarté(s)</span>}
    {!o.created && !o.completed && !o.unchanged && !o.skipped && <span className="text-muted">rien à importer</span>}
  </div>
)

export function ImportReport({ r }) {
  const [openC, setOpenC] = useState(false)
  const [openS, setOpenS] = useState(false)
  if (!r?.contacts) return null
  return (
    <div className="space-y-2">
      <Bloc titre="Contacts" o={r.contacts} />
      <Bloc titre="Entreprises" o={r.companies} />

      {(r.errors || []).map((e, i) => (
        <p key={i} className="text-xs text-red-500 flex items-start gap-1.5">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" /> <span>{e.kind} : {e.message}</span>
        </p>
      ))}

      {/* ⚠️ Replié : la liste peut être longue, et elle ne concerne que qui veut
          trancher. Mais elle doit exister — c'est la contrepartie du refus d'écraser. */}
      {(r.conflicts || []).length > 0 && (
        <div>
          <button className="text-xs text-brand flex items-center gap-1" onClick={() => setOpenC(o => !o)}>
            {openC ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {r.conflicts.length} valeur(s) différente(s) — conservées telles quelles
          </button>
          {openC && (
            <div className="mt-1 space-y-1 max-h-48 overflow-y-auto">
              {r.conflicts.map((c, i) => (
                <div key={i} className="text-xs flex items-start gap-2">
                  <span className="font-semibold shrink-0">{c.label}</span>
                  <span className="text-muted shrink-0">{c.field}</span>
                  <span className="truncate">« {c.mine} »</span>
                  <span className="text-muted shrink-0">au lieu de</span>
                  <span className="truncate text-muted">« {c.theirs} »</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted mt-1">Rien n'a été remplacé : corrigez au cas par cas depuis la fiche.</p>
        </div>
      )}

      {(r.skipped || []).length > 0 && (
        <div>
          <button className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1" onClick={() => setOpenS(o => !o)}>
            {openS ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {r.skipped.length} ligne(s) écartée(s) — et pourquoi
          </button>
          {openS && (
            <div className="mt-1 space-y-1 max-h-48 overflow-y-auto">
              {r.skipped.map((s, i) => (
                <div key={i} className="text-xs flex items-start gap-2">
                  <span className="font-semibold shrink-0">{s.label}</span>
                  <span className="text-muted">{s.why}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
