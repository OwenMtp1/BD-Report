// ---------------------------------------------------------------------------
//  🤖 UTILISATION IA — ce que l'équipe consomme chez Gemini.
//
//  Deux fonctionnalités appellent l'IA (analyse d'actualités, enrichissement de
//  fiche) et l'offre gratuite se consomme. Cet écran existe pour qu'on VOIE VENIR
//  la limite, au lieu de la découvrir un matin où plus rien ne répond.
//
//  ⚠️ LE PLAFOND AFFICHÉ N'EST PAS CELUI DE GOOGLE. L'API ne publie pas le quota
//  restant : prétendre le refléter serait afficher un chiffre inventé. C'est une
//  sécurité que l'application se donne, réglable, et l'écran le dit.
// ---------------------------------------------------------------------------
import React from 'react'
import { Bot, AlertTriangle, Users2, Clock } from 'lucide-react'
import { useStore, AI_FEATURES, fmtDate } from '../store.jsx'
import { Empty, CommitInput, toast } from '../ui.jsx'

const BAR = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  high: 'bg-orange-500',
  critical: 'bg-red-500',
}
const since = (iso) => {
  if (!iso) return '—'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return "à l'instant"
  if (m < 60) return `il y a ${m} min`
  const h = Math.round(m / 60)
  return h < 24 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`
}

export default function AiUsage() {
  const store = useStore()
  const stats = store.aiUsageStats()
  const t = stats.today
  const pct = Math.min(100, Math.round(t.pct * 100))
  const canSet = store.canSetNewsRelay()

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-extrabold flex items-center gap-2"><Bot size={20} className="text-brand" /> Utilisation IA</h2>
      <p className="text-xs text-muted -mt-2">
        Appels réellement envoyés à Gemini. Une réponse servie par le cache ne compte pas — elle n'a rien consommé.
      </p>

      {/* Aujourd'hui */}
      <div className="card p-4 space-y-2 max-w-2xl">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <span className="font-bold">Gemini — aujourd'hui</span>
          <span className="text-sm"><b className="text-lg">{t.count}</b> / {t.limit} appels</span>
        </div>
        <div className="h-3 rounded-full bg-surface overflow-hidden">
          <div className={`h-full rounded-full transition-all ${BAR[t.level] || BAR.ok}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-muted">
          <span>{pct} %</span>
          <span>{t.left} appels restants</span>
        </div>
        {t.level !== 'ok' && (
          <div className={`text-xs rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 ${t.level === 'critical' ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'}`}>
            <AlertTriangle size={13} className="shrink-0" />
            {t.count >= t.limit
              ? "Plafond atteint : les nouveaux appels sont bloqués. Les actualités restent consultables sans analyse."
              : `${t.label} — il reste ${t.left} appels avant le blocage.`}
          </div>
        )}
        <div className="flex gap-4 flex-wrap text-xs text-muted pt-1 border-t border-line">
          <span className="flex items-center gap-1"><Users2 size={12} /> {stats.users} utilisateur{stats.users > 1 ? 's' : ''} actif{stats.users > 1 ? 's' : ''}</span>
          <span className="flex items-center gap-1"><Clock size={12} /> Dernier appel : {since(stats.lastAt)}</span>
          {stats.errors > 0 && <span className="text-red-600">{stats.errors} échec{stats.errors > 1 ? 's' : ''} aujourd'hui</span>}
        </div>
      </div>

      {/* Réglage du plafond */}
      {canSet && (
        <div className="card p-4 space-y-2 max-w-2xl">
          <div className="font-bold text-sm">Plafond quotidien</div>
          <p className="text-xs text-muted">
            Sécurité interne à l'application, sans rapport avec le quota réel de Google — l'API ne le publie pas.
          </p>
          <CommitInput className="input !w-32" value={String(t.limit)}
            onCommit={v => { store.setAiDailyLimit(v); toast('Plafond quotidien enregistré') }} />
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        {/* Historique par jour */}
        <div className="card p-4 space-y-2">
          <div className="font-bold text-sm">Historique quotidien</div>
          {stats.byDay.length === 0 ? <Empty text="Aucun appel enregistré." /> : (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted text-left"><th className="pb-1">Date</th><th className="pb-1 text-right">Appels</th></tr></thead>
              <tbody>
                {stats.byDay.map(d => (
                  <tr key={d.date} className="border-t border-line">
                    <td className="py-1">{fmtDate(d.date)}</td>
                    <td className="py-1 text-right num font-semibold">{d.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Par utilisateur */}
        <div className="card p-4 space-y-2">
          <div className="font-bold text-sm">Utilisation par utilisateur</div>
          {stats.byUser.length === 0 ? <Empty text="Aucun appel enregistré." /> : (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted text-left"><th className="pb-1">Utilisateur</th><th className="pb-1 text-right">Appels</th></tr></thead>
              <tbody>
                {stats.byUser.map(u => (
                  <tr key={u.name} className="border-t border-line">
                    <td className="py-1 truncate">{u.name}</td>
                    <td className="py-1 text-right num font-semibold">{u.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Par fonctionnalité : savoir laquelle coûte. */}
      <div className="card p-4 space-y-2 max-w-2xl">
        <div className="font-bold text-sm">Par fonctionnalité</div>
        <div className="flex gap-2 flex-wrap">
          {AI_FEATURES.map(f => {
            const row = stats.byFeature.find(x => x.id === f.id) || { n: 0 }
            return <span key={f.id} className="chip bg-surface text-muted">{f.label} · <b className="text-ink">{row.n}</b></span>
          })}
        </div>
      </div>
    </div>
  )
}
