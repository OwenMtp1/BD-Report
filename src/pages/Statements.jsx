import React, { useState } from 'react'
import { FileSignature, Download, ShieldCheck, Clock, RotateCcw, AlertTriangle } from 'lucide-react'
import { useStore, monthKey, monthLabel, fmtDate, fmtMoney } from '../store.jsx'
import { Modal, Empty, toast } from '../ui.jsx'

// Relevés de primes — module `statements`.
// Les litiges sur la variable coûtent des heures de management chaque mois, faute d'un document
// que les deux parties reconnaissent. Celui-ci est figé à la signature du manager, puis
// téléchargeable par le collaborateur. Avant signature : rien à télécharger, et c'est le sujet —
// un relevé non validé n'engage personne.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function downloadStatement(st, who, envName) {
  const money = (v) => fmtMoney(v, st.currency)
  const rows = st.lines.map(l => `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(fmtDate(l.date))}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(l.label)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#777">${esc(l.detail)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${esc(money(l.montant))}</td>
    </tr>`).join('')
  const steps = (st.steps || []).map(s => `<tr>
      <td colspan="3" style="padding:4px 10px;color:#777">${esc(s.label)}</td>
      <td style="padding:4px 10px;text-align:right">${esc(money(Math.round(s.to)))}</td>
    </tr>`).join('')
  const sig = st.signature
    ? `<div style="margin-top:28px;border-top:1px solid #ddd;padding-top:12px">
         <div style="font-size:12px;color:#777">Validé et signé par</div>
         <div style="font-family:Georgia,serif;font-size:22px;font-style:italic;margin-top:4px">${esc(st.signature.by)}</div>
         <div style="font-size:12px;color:#777;margin-top:4px">le ${esc(new Date(st.signature.at).toLocaleString('fr-FR'))} — atteste de l'exactitude des informations ci-dessus.</div>
       </div>`
    : ''
  const html = `<html><head><meta charset="utf-8"><title>Relevé de primes — ${esc(who)} — ${esc(st.monthLabel)}</title></head>
    <body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111;max-width:760px;margin:32px auto">
      <div style="font-size:12px;color:#777">${esc(envName || '')}</div>
      <h1 style="margin:4px 0 0">Relevé de primes</h1>
      <div style="color:#555">${esc(who)} — ${esc(st.monthLabel)}</div>
      <table style="width:100%;border-collapse:collapse;margin-top:20px;font-size:14px">
        <tr style="text-align:left;color:#888;font-size:12px">
          <th style="padding:6px 10px">Date</th><th style="padding:6px 10px">Objet</th>
          <th style="padding:6px 10px">Détail</th><th style="padding:6px 10px;text-align:right">Montant</th>
        </tr>
        ${rows || '<tr><td colspan="4" style="padding:10px;color:#888">Aucune prime sur ce mois.</td></tr>'}
        <tr><td colspan="3" style="padding:8px 10px;border-top:1px solid #ccc">Total du barème</td>
            <td style="padding:8px 10px;border-top:1px solid #ccc;text-align:right">${esc(money(st.raw))}</td></tr>
        ${steps}
        <tr><td colspan="3" style="padding:8px 10px;font-weight:bold;border-top:2px solid #111">Net à verser</td>
            <td style="padding:8px 10px;font-weight:bold;border-top:2px solid #111;text-align:right">${esc(money(st.total))}</td></tr>
      </table>
      ${sig}
    </body></html>`
  const w = window.open('', '_blank')
  if (!w) { window.dispatchEvent(new CustomEvent('app-toast', { detail: '⚠️ Fenêtre bloquée : autorisez les pop-ups pour télécharger le relevé.' })); return }
  w.document.write(html); w.document.close(); w.print()
}

function StatementBody({ st }) {
  const money = (v) => fmtMoney(v, st.currency)
  return (
    <div className="space-y-1.5">
      {st.lines.length === 0 && <p className="text-xs text-muted">Aucune prime rattachée à ce mois.</p>}
      {st.lines.map((l, i) => (
        <div key={i} className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0 truncate">
            <span className="text-muted text-xs mr-2">{fmtDate(l.date)}</span>
            {l.label}
            {l.detail && <span className="text-muted text-xs"> — {l.detail}</span>}
          </span>
          <span className="num shrink-0">{money(l.montant)}</span>
        </div>
      ))}
      {st.lines.length > 0 && (
        <div className="flex items-center justify-between text-sm pt-1.5 border-t border-line">
          <span className="text-muted">Total du barème</span><span className="num">{money(st.raw)}</span>
        </div>
      )}
      {(st.steps || []).map((s, i) => (
        <div key={i} className="flex items-center justify-between gap-3 text-xs text-muted">
          <span className="min-w-0">{s.label}</span><span className="num shrink-0">{money(Math.round(s.to))}</span>
        </div>
      ))}
      <div className="flex items-center justify-between text-sm pt-1.5 border-t border-line">
        <span className="font-bold">Net à verser</span><span className="font-extrabold num text-brand">{money(st.total)}</span>
      </div>
    </div>
  )
}

// ---- Côté manager : la liste de l'équipe, et la signature.
export function StatementsManager() {
  const store = useStore()
  const envId = store.session?.envId
  const env = store.db.environments.find(e => e.id === envId)
  const subs = store.db.subenvs.filter(s => s.envId === envId)
  const [mKey, setMKey] = useState(monthKey(new Date()))
  const [signFor, setSignFor] = useState(null)
  const [attest, setAttest] = useState(false)
  const [open, setOpen] = useState(null)
  const me = store.db.subenvs.find(s => s.id === store.session?.subEnvId)
  const myName = me ? `${me.prenom} ${me.nom}`.trim() : (store.account?.pseudo || '')

  const months = [0, -1, -2, -3].map(o => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + o)
    return { key: monthKey(d), label: monthLabel(d) }
  })
  const label = months.find(m => m.key === mKey)?.label || mKey

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-bold flex items-center gap-2"><FileSignature size={17} className="text-brand" /> Relevés de primes</h3>
          <p className="text-xs text-muted -mt-0.5">Tant que vous ne l'avez pas signé, le relevé reste un brouillon : le collaborateur ne peut pas le télécharger.</p>
        </div>
        <select className="input !w-auto !py-1.5 text-xs" value={mKey} onChange={e => setMKey(e.target.value)}>
          {months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      </div>

      {subs.length === 0 && <Empty text="Aucun collaborateur dans cet environnement." />}

      <div className="space-y-2">
        {subs.map(s => {
          const st = store.statementFor(s.id, mKey)
          const signed = !!st.signature
          return (
            <div key={s.id} className="rounded-xl border border-line p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm flex-1 min-w-0 truncate">{s.prenom} {s.nom}</span>
                <span className="num text-sm">{fmtMoney(st.total, st.currency)}</span>
                {signed
                  ? <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 flex items-center gap-1"><ShieldCheck size={11} /> signé</span>
                  : <span className="chip bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 flex items-center gap-1"><Clock size={11} /> à valider</span>}
              </div>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                <button className="btn-ghost !py-1 text-xs" onClick={() => setOpen(open === s.id ? null : s.id)}>
                  {open === s.id ? 'Masquer le détail' : 'Voir le détail'}
                </button>
                {!signed && (
                  <button className="btn-primary !py-1 text-xs" onClick={() => { setSignFor({ sub: s, st }); setAttest(false) }}>
                    <FileSignature size={13} /> Valider et signer
                  </button>
                )}
                {signed && <>
                  <button className="btn-ghost !py-1 text-xs" onClick={() => downloadStatement({ ...st, monthLabel: label }, `${s.prenom} ${s.nom}`, env?.name)}>
                    <Download size={13} /> Télécharger
                  </button>
                  <button className="btn-ghost !py-1 text-xs !text-red-600" title="Le document figé est effacé et le relevé redevient un brouillon"
                    onClick={() => { store.unsignStatement(s.id, mKey); toast('Signature retirée — le relevé redevient un brouillon') }}>
                    <RotateCcw size={13} /> Retirer la signature
                  </button>
                </>}
              </div>
              {signed && (
                <p className="text-[11px] text-muted mt-1.5">Signé par {st.signature.by} le {new Date(st.signature.at).toLocaleString('fr-FR')}.</p>
              )}
              {open === s.id && <div className="mt-2.5 pt-2.5 border-t border-line"><StatementBody st={st} /></div>}
            </div>
          )
        })}
      </div>

      {signFor && (
        <Modal title="Signer le relevé de primes" onClose={() => setSignFor(null)}>
          <p className="text-sm text-muted mb-3">
            Relevé de <b>{signFor.sub.prenom} {signFor.sub.nom}</b> pour {label} —
            net à verser <b>{fmtMoney(signFor.st.total, signFor.st.currency)}</b>.
          </p>
          <div className="rounded-xl bg-surface/60 p-3 mb-3 max-h-52 overflow-y-auto"><StatementBody st={signFor.st} /></div>
          {mKey === monthKey(new Date()) && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-2.5 mb-3 flex gap-2">
              <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Ce mois n'est pas terminé : une prime déclenchée d'ici la fin du mois n'y figurera pas,
                puisque le relevé est figé à la signature. Attendez la clôture, ou assumez de le rouvrir.
              </p>
            </div>
          )}
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="mt-1" checked={attest} onChange={e => setAttest(e.target.checked)} />
            <span>
              Je certifie l'exactitude des informations de ce relevé et je le signe. Le document sera
              <b> figé en l'état</b> et deviendra téléchargeable par le collaborateur.
            </span>
          </label>
          <div className="rounded-xl border border-line p-3 mt-3">
            <div className="text-[11px] uppercase tracking-wide text-muted">Signature apposée sur le document</div>
            <div className="text-xl italic mt-1" style={{ fontFamily: 'Georgia, serif' }}>{myName}</div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button className="btn-ghost" onClick={() => setSignFor(null)}>Annuler</button>
            <button className="btn-primary" disabled={!attest} onClick={() => {
              store.signStatement(signFor.sub.id, mKey)
              store.logAction('Prime', 'Relevé de primes signé', `${signFor.sub.prenom} ${signFor.sub.nom} — ${label}`)
              toast('Relevé signé — le collaborateur peut le télécharger')
              setSignFor(null)
            }}>Signer le relevé</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ---- Côté collaborateur : son relevé, téléchargeable une fois signé.
export function MyStatement() {
  const store = useStore()
  const subId = store.session?.subEnvId
  const env = store.db.environments.find(e => e.id === store.session?.envId)
  const me = store.db.subenvs.find(s => s.id === subId)
  const [mKey, setMKey] = useState(monthKey(new Date()))
  const months = [0, -1, -2, -3].map(o => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + o)
    return { key: monthKey(d), label: monthLabel(d) }
  })
  const label = months.find(m => m.key === mKey)?.label || mKey
  const st = store.statementFor(subId, mKey)
  const signed = !!st.signature

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-bold flex items-center gap-2"><FileSignature size={16} className="text-brand" /> Mon relevé de primes</h3>
        <select className="input !w-auto !py-1.5 text-xs" value={mKey} onChange={e => setMKey(e.target.value)}>
          {months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      </div>
      <StatementBody st={st} />
      {signed ? (
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn-primary !py-1.5 text-xs"
            onClick={() => downloadStatement({ ...st, monthLabel: label }, me ? `${me.prenom} ${me.nom}` : '', env?.name)}>
            <Download size={14} /> Télécharger le relevé signé
          </button>
          <span className="text-[11px] text-muted">Signé par {st.signature.by} le {new Date(st.signature.at).toLocaleString('fr-FR')}.</span>
        </div>
      ) : (
        <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
          <Clock size={13} /> En attente de validation par votre manager — le relevé n'est pas encore téléchargeable.
        </p>
      )}
    </div>
  )
}
