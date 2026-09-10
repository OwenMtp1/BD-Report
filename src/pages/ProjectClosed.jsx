// ---------------------------------------------------------------------------
//  L'ÉCRAN DU PROPRIÉTAIRE D'UN PROJET FERMÉ.
//
//  Quand BD Report ferme l'accès d'un client, tous les comptes de l'environnement
//  sont désactivés — sauf celui du propriétaire. Lui peut encore se connecter, mais
//  il n'a plus d'espace où entrer : l'application ne lui ouvre donc QUE la discussion
//  de fermeture. Ce n'est pas une punition, c'est la seule chose qui lui reste à
//  faire, et le seul endroit où la décision peut encore se discuter.
//
//  Ce que cet écran ne dit JAMAIS : qui, chez BD Report, a fermé l'accès. La décision
//  est celle de l'éditeur, pas d'une personne qu'on prendrait à partie.
// ---------------------------------------------------------------------------
import React from 'react'
import { LogOut, Lock } from 'lucide-react'
import { useStore } from '../store.jsx'
import { Logo } from '../Brand.jsx'
import TicketChat from './TicketChat.jsx'

export default function ProjectClosed({ ticket }) {
  const store = useStore()
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <header className="bg-card border-b border-line px-4 py-3 flex items-center gap-3 flex-wrap">
        <Logo size={28} />
        <span className="text-sm text-muted flex-1 min-w-0 truncate">{store.account?.pseudo}</span>
        <button className="btn-ghost !py-1 text-xs" onClick={() => store.logout()}><LogOut size={13} /> Se déconnecter</button>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto p-4 space-y-3">
        <div className="card p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0">
            <Lock size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="font-extrabold text-lg">Accès fermé</h1>
            <p className="text-sm text-muted mt-1">
              L'accès au logiciel BD Report a été fermé par l'équipe BD Report. Vos données sont mises de côté, et les accès de votre équipe sont suspendus.
            </p>
            <p className="text-sm text-muted mt-1">
              Cette discussion sert à décider de la suite avec l'équipe : remettre le projet en place, ou le supprimer définitivement.
            </p>
          </div>
        </div>

        <div className="card p-3 h-[62vh]"><TicketChat ticket={ticket} role="user" /></div>
      </main>
    </div>
  )
}
