import React, { useRef, useState } from 'react'
import { Bot, Send, X } from 'lucide-react'
import { useStore, uid, todayISO, computePrimes, primeOpts, monthKey } from './store.jsx'

// Assistant local : comprend des commandes en français et agit sur les données.
function runCommand(text, store) {
  const t = text.toLowerCase()
  const sub = store.sub

  // Créer un RDV : "crée un rdv avec Acme" / "nouveau rdv Acme"
  const rdvMatch = t.match(/(?:cr[ée]e?r?|nouveau|ajoute)\s+(?:un\s+)?(?:rdv|rendez[- ]vous)\s*(?:avec|pour|chez)?\s*(.*)/)
  if (rdvMatch) {
    const entreprise = (rdvMatch[1] || '').trim() || 'Nouvelle entreprise'
    store.setSub(d => {
      d.rdvs.push({
        id: uid(), parentId: null, source: '', phase: 'R1', opportunite: 'En cours',
        entreprise: entreprise.charAt(0).toUpperCase() + entreprise.slice(1), effectif: '', secteur: '', linkedin: '',
        provenance: d.provenances[0] || 'Cold Call', contacts: [], dateRdv: '', datePriseRdv: todayISO(),
        datePassageSQL: '', notes: 'Créé par l\'assistant IA', history: [{ type: 'phase', value: 'R1', date: todayISO() }], createdAt: todayISO(),
      })
      return d
    })
    return `✅ RDV créé pour « ${entreprise} » (phase R1, opportunité En cours). Retrouvez-le dans Mes Rendez-vous.`
  }

  // Note : "note : penser à relancer X" / "ajoute une note ..."
  const noteMatch = text.match(/note\s*:?\s+(.+)/i)
  if (noteMatch) {
    store.setSub(d => {
      d.notes.push({ id: uid(), title: 'Note assistant', content: noteMatch[1], folder: d.noteFolders[0] || 'Général', pinned: false, archived: false, createdAt: todayISO(), phase: '', opportunite: '' })
      return d
    })
    return '📝 Note enregistrée dans Mes notes.'
  }

  // Grille de primes : "ajoute une prime de 250 pour 100 à 300 collaborateurs"
  const primeMatch = t.match(/prime\s+de\s+(\d+).{0,30}?(\d+)\s*(?:à|a|-)\s*(\d+)/)
  if (primeMatch) {
    store.setSub(d => {
      d.bareme.push({ id: uid(), min: Number(primeMatch[2]), max: Number(primeMatch[3]), montant: Number(primeMatch[1]), leadSource: '' })
      return d
    })
    return `💶 Catégorie de commission ajoutée : ${primeMatch[2]}–${primeMatch[3]} collaborateurs → ${primeMatch[1]} €.`
  }

  // ---- Problème / bug signalé : on oriente l'utilisateur vers le Support
  if (/(probl[èe]me|souci|bug|bogue|erreur|plante|plant[ée]|impossible|arrive pas|marche pas|fonctionne pas|affiche pas|charge pas|écran blanc|lenteur|c'est lent|ça rame|ça bug|ne s'ouvre)/i.test(text)) {
    return {
      text: "Je suis désolé pour la gêne 🙁 Cela ressemble à un souci technique. Je vous oriente vers le Support : ouvrez un ticket et l'équipe technique BD Report prend le relais directement dans une conversation.",
      action: 'support', payload: text,
    }
  }

  // ---- Questions analytiques
  if (t.includes('meilleur') && (t.includes('canal') || t.includes('source') || t.includes('provenance'))) {
    const counts = {}
    sub.rdvs.forEach(r => {
      const k = r.provenance || r.source
      if (!k) return
      counts[k] = counts[k] || { total: 0, sql: 0 }
      counts[k].total++
      if (['SQL', 'Signée'].includes(r.phase)) counts[k].sql++
    })
    const ranked = Object.entries(counts).sort((a, b) => b[1].sql - a[1].sql || b[1].total - a[1].total)
    if (!ranked.length) return 'Pas encore assez de données pour identifier un meilleur canal.'
    const [best, s] = ranked[0]
    return `🏅 Votre meilleur canal est « ${best} » : ${s.sql} SQL sur ${s.total} RDV (${Math.round((s.sql / s.total) * 100)} % de conversion).\n` +
      ranked.slice(1, 4).map(([k, v]) => `· ${k} : ${v.sql} SQL / ${v.total} RDV`).join('\n')
  }
  if ((t.includes('relancer') || t.includes('relance')) && (t.includes('lead') || t.includes('qui') || t.includes('quel'))) {
    const stale = sub.rdvs.filter(r => r.opportunite === 'En cours')
      .sort((a, b) => (a.dateRdv || '').localeCompare(b.dateRdv || '')).slice(0, 3)
    const noShows = sub.rdvs.filter(r => r.opportunite === 'No Show R1')
    if (!stale.length && !noShows.length) return 'Rien à relancer pour le moment — pipeline à jour ! 🎉'
    let msg = '🎯 À relancer en priorité :\n'
    noShows.forEach(r => { msg += `· ${r.entreprise} — No Show R1 à replanifier\n` })
    stale.forEach(r => { msg += `· ${r.entreprise} — ${r.phase}, RDV du ${r.dateRdv || '?'}\n` })
    return msg + 'Retrouvez tout dans l\'onglet « Tâches prioritaires ».'
  }
  if (t.includes('conversion') || t.includes('taux')) {
    const total = sub.rdvs.length || 1
    const mql = sub.rdvs.filter(r => ['MQL', 'SQL', 'Signée'].includes(r.phase)).length
    const sql = sub.rdvs.filter(r => ['SQL', 'Signée'].includes(r.phase)).length
    const sig = sub.rdvs.filter(r => r.phase === 'Signée').length
    return `📊 Vos taux de conversion :\n· RDV → MQL : ${Math.round((mql / total) * 100)} %\n· RDV → SQL : ${Math.round((sql / total) * 100)} %\n· SQL → Signature : ${sql ? Math.round((sig / sql) * 100) : 0} %`
  }
  if (t.includes('prévisionnel') || t.includes('previsionnel') || (t.includes('prime') && t.includes('venir'))) {
    const PROBA = { R1: 0.25, R2: 0.4, MQL: 0.6 }
    let total = 0
    sub.rdvs.filter(r => r.opportunite === 'En cours' && PROBA[r.phase]).forEach(r => {
      const eff = Number(r.effectif) || 0
      const bar = sub.bareme.find(b => eff >= Number(b.min) && eff <= Number(b.max) && (!b.leadSource || b.leadSource === r.source))
        || sub.bareme.find(b => eff >= Number(b.min) && eff <= Number(b.max))
      if (bar) total += (Number(bar.montant) || 0) * PROBA[r.phase]
    })
    return `🔮 Prévisionnel de primes sur vos opportunités en cours : ≈ ${Math.round(total)} € (pondéré par phase). Détail dans Primes & Commissions.`
  }

  // Stats
  if (t.includes('sql')) {
    const n = sub.rdvs.filter(r => ['SQL', 'Signée'].includes(r.phase)).length
    return `📊 Vous avez ${n} SQL au total (dont ${sub.rdvs.filter(r => r.phase === 'Signée').length} signés).`
  }
  if (t.includes('mql')) {
    return `📊 Vous avez ${sub.rdvs.filter(r => ['MQL', 'SQL', 'Signée'].includes(r.phase)).length} MQL au total.`
  }
  if (t.includes('prime')) {
    const primes = computePrimes(sub.rdvs, sub.bareme, primeOpts(sub))
    const cur = monthKey(new Date())
    const mois = primes.filter(p => p.payMonthKey === cur).reduce((a, p) => a + p.montant, 0)
    return `💶 Primes : ${mois} € payées ce mois-ci, ${primes.reduce((a, p) => a + p.montant, 0)} € au total.`
  }
  if (t.includes('rdv') || t.includes('rendez')) {
    return `📅 Vous avez ${sub.rdvs.length} rendez-vous au total, dont ${sub.rdvs.filter(r => r.opportunite === 'En cours').length} opportunités en cours.`
  }
  if (t.includes('dashboard')) {
    return `📈 Pour créer ou modifier un dashboard : allez dans « Dashboard personnalisé » et décrivez ce que vous voulez, ou dites-moi par exemple « note : idée de dashboard... ». Vous pouvez aussi réorganiser les widgets via Paramètres → Widgets dashboard.`
  }
  return `Je peux : créer un RDV (« crée un rdv avec Acme »), ajouter une note (« note : relancer Claire »), ajouter une catégorie de prime (« ajoute une prime de 250 pour 100 à 300 collaborateurs »), vous donner vos stats (SQL, MQL, primes, RDV), et répondre à des questions : « quel est mon meilleur canal ? », « quels leads relancer ? », « mes taux de conversion ? », « mon prévisionnel de primes ? ».`
}

export default function Chatbot() {
  const store = useStore()
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState([{ from: 'bot', text: 'Bonjour 👋 Je suis votre assistant BDR. Demandez-moi de créer un RDV, une note, une grille de primes, ou vos statistiques.' }])
  const [input, setInput] = useState('')
  const endRef = useRef(null)

  const send = () => {
    if (!input.trim()) return
    const reply = runCommand(input, store)
    const botMsg = typeof reply === 'string' ? { from: 'bot', text: reply } : { from: 'bot', ...reply }
    setMsgs(m => [...m, { from: 'me', text: input }, botMsg])
    setInput('')
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  const goSupport = (payload) => {
    setOpen(false)
    window.dispatchEvent(new CustomEvent('app-navigate', { detail: 'support' }))
    // Laisse la page Support se monter avant de pré-remplir le ticket.
    setTimeout(() => window.dispatchEvent(new CustomEvent('open-support-ticket', { detail: payload || '' })), 80)
  }

  return (
    <>
      <button className="fixed bottom-5 right-5 z-40 w-13 h-13 p-3.5 rounded-full bg-brand text-white shadow-lg hover:scale-105 transition"
        onClick={() => setOpen(o => !o)} title="Assistant IA">
        <Bot size={24} />
      </button>
      {open && (
        <div className="fixed bottom-20 right-5 z-40 w-80 card shadow-2xl flex flex-col max-h-[60vh] fade-in">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <span className="font-bold text-sm flex items-center gap-2"><Bot size={16} className="text-brand" /> Assistant BDR</span>
            <button onClick={() => setOpen(false)}><X size={16} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {msgs.map((m, i) => (
              <div key={i} className={`max-w-[90%] ${m.from === 'bot' ? '' : 'ml-auto'}`}>
                <div className={`text-sm p-2.5 rounded-xl whitespace-pre-wrap ${m.from === 'bot' ? 'bg-surface' : 'bg-brand text-white'}`}>
                  {m.text}
                </div>
                {m.action === 'support' && (
                  <button className="btn-primary !py-1.5 text-xs mt-1.5" onClick={() => goSupport(m.payload)}>🎫 Ouvrir un ticket de support</button>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="p-2.5 border-t border-line flex gap-2">
            <input className="input !py-1.5 text-sm" placeholder="Votre demande..." value={input}
              onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} />
            <button className="btn-primary !px-2.5" onClick={send}><Send size={15} /></button>
          </div>
        </div>
      )}
    </>
  )
}
