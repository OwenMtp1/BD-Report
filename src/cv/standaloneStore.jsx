// Store minimal pour la version autonome du générateur de CV (hors application BD Report).
// Fournit la même surface que le store principal utilisée par CvGenerator :
// { sub: { cvs }, setSub } + les helpers uid / todayISO / fmtDate.
import React, { createContext, useContext, useEffect, useState } from 'react'

export const uid = () => Math.random().toString(36).slice(2, 10)
export const todayISO = () => new Date().toISOString().slice(0, 10)
export const fmtDate = (s) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('fr-FR') : '—')

const KEY = 'cv_generator_standalone_v1'
const Ctx = createContext(null)
export const useStore = () => useContext(Ctx)

export function StandaloneProvider({ children }) {
  const [data, setData] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY)) || { cvs: [] } } catch (e) { return { cvs: [] } }
  })
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(data)) } catch (e) { /* quota */ } }, [data])
  const api = { sub: data, setSub: (fn) => setData(d => fn(d)) }
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}
