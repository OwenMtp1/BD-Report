// ---------------------------------------------------------------------------
//  PROJETS & ATELIER — un seul écran pour un seul travail
//
//  Un projet EST la livraison d'un environnement. L'atelier compose l'environnement,
//  le projet suit sa mise en place. Séparés en deux onglets, ils imposaient un
//  va-et-vient permanent : composer l'espace dans l'atelier, retrouver le projet
//  ailleurs pour le déployer, revenir à l'atelier pour ajuster un rôle.
//
//  Deux vues, et surtout deux PASSERELLES, sans lesquelles ce ne serait qu'un onglet
//  dans un onglet :
//   · depuis une livraison → l'atelier s'ouvre SUR l'environnement de cette livraison ;
//   · à la sortie de l'assistant → on revient sur la livraison qui vient de naître.
//
//  ⚠️ Fusionner deux écrans ne donne AUCUN droit. La vue Atelier n'apparaît qu'avec
//  `env.build`, la vue Livraisons qu'avec `projects.view` — exactement comme avant.
//  Sans cette garde, réunir les onglets aurait ouvert la composition d'environnements
//  à tous ceux qui pouvaient seulement consulter les projets.
// ---------------------------------------------------------------------------
import React, { useState } from 'react'
import { FolderKanban, Hammer } from 'lucide-react'
import { useStore } from '../store.jsx'
import { Empty, toast } from '../ui.jsx'
import Projects from './Projects.jsx'
import Workshop from './Workshop.jsx'

export default function Delivery() {
  const store = useStore()
  const canProjects = store.hasPerm('projects.view')
  const canBuild = store.hasPerm('env.build')
  const views = [
    canProjects && { id: 'projects', label: 'Livraisons', icon: FolderKanban },
    canBuild && { id: 'workshop', label: 'Atelier', icon: Hammer },
  ].filter(Boolean)

  const [view, setView] = useState(views[0]?.id || 'projects')
  // Environnement sur lequel ouvrir l'atelier quand on y arrive depuis une livraison.
  const [focusEnv, setFocusEnv] = useState(null)
  const [startInWizard, setStartInWizard] = useState(false)

  if (!views.length) return <Empty text="Vous n'avez accès ni aux livraisons ni à l'atelier." />

  const openWorkshop = (envId) => { setFocusEnv(envId); setStartInWizard(false); setView('workshop') }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-extrabold flex items-center gap-2">
            <FolderKanban size={20} className="text-brand" /> Projets & atelier
          </h2>
          <p className="text-xs text-muted -mt-0.5">
            Composer l'environnement d'un client et suivre sa mise en place — deux moments du
            même travail, au même endroit.
          </p>
        </div>
        {views.length > 1 && (
          <div className="flex gap-1 p-1 rounded-xl bg-surface">
            {views.map(v => (
              <button key={v.id} onClick={() => { setView(v.id); setStartInWizard(false) }}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition flex items-center gap-1.5 ${view === v.id ? 'bg-card shadow text-ink' : 'text-muted hover:text-ink'}`}>
                <v.icon size={14} /> {v.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {view === 'workshop' && canBuild ? (
        <Workshop
          embedded
          initialEnvId={focusEnv}
          startInWizard={startInWizard}
          // Un environnement composé produit sa livraison : on y ramène plutôt que de
          // laisser l'utilisateur la chercher dans l'autre vue.
          onCreated={() => {
            if (!canProjects) return
            setView('projects')
            toast('Environnement composé — sa livraison vous attend ici')
          }}
        />
      ) : (
        <Projects embedded onOpenWorkshop={canBuild ? openWorkshop : null} />
      )}
    </div>
  )
}
