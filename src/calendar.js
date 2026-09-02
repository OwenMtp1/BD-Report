// Ajout d'un RDV à un calendrier externe — 100 % front (sans backend/OAuth) :
// lien Google Agenda + fichier .ics compatible Outlook / Apple Calendar.
// (La vraie synchro bidirectionnelle Gmail/Outlook nécessiterait un backend OAuth.)

function endNextDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

export function googleCalUrl(rdv) {
  if (!rdv?.dateRdv) return null
  const start = rdv.dateRdv.replace(/-/g, '')
  const end = endNextDay(rdv.dateRdv)
  const text = encodeURIComponent(`RDV — ${rdv.entreprise || 'Prospect'}`)
  const details = encodeURIComponent(`Phase : ${rdv.phase || ''}${rdv.notes ? '\n' + rdv.notes : ''}`)
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${end}&details=${details}`
}

function icsFor(rdv) {
  if (!rdv?.dateRdv) return null
  const start = rdv.dateRdv.replace(/-/g, '')
  const end = endNextDay(rdv.dateRdv)
  const uid = `${rdv.id || Math.random().toString(36).slice(2)}@bdreport`
  const esc = (s) => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n')
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BD Report//FR', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${uid}`, `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${esc('RDV — ' + (rdv.entreprise || 'Prospect'))}`,
    `DESCRIPTION:${esc('Phase : ' + (rdv.phase || '') + (rdv.notes ? '\n' + rdv.notes : ''))}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
}

export function downloadIcs(rdv) {
  const ics = icsFor(rdv)
  if (!ics) return
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `rdv-${(rdv.entreprise || 'rdv').replace(/[^a-z0-9]/gi, '_')}.ics`
  a.click()
  URL.revokeObjectURL(a.href)
}
