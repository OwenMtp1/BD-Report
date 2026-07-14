import React, { useEffect, useRef } from 'react'
import { rgba, mix, readableOn } from './colors.js'
import { LANG_LEVELS } from './questionnaire.js'

// Dimensions A4 à 96 dpi (le document est exporté tel quel en PDF/JPG).
export const A4_W = 794
export const A4_H = 1123

// Champ éditable inline (contentEditable non contrôlé : commit au blur, pas de saut de curseur).
function Editable({ value, path, onField, editable, tag = 'div', style, className = '', placeholder = '', multiline = false }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current && ref.current.innerText !== (value || '')) ref.current.innerText = value || ''
  }, [value])
  const base = { style, className: 'cv-ed ' + className }
  if (!editable) {
    if (!value) return null
    return React.createElement(tag, base, value)
  }
  return React.createElement(tag, {
    ...base, ref, contentEditable: true, suppressContentEditableWarning: true,
    'data-ph': placeholder,
    onBlur: (e) => { const v = multiline ? e.currentTarget.innerText : e.currentTarget.innerText.replace(/\n/g, ' ').trim(); onField(path, v) },
  })
}

// Niveau de langue → fraction (pour les points de niveau).
const langFrac = (niv) => {
  const i = LANG_LEVELS.indexOf(niv)
  return i < 0 ? 0.6 : (i + 1) / LANG_LEVELS.length
}

// Position de chaque bloc de champ selon l'archetype de mise en page.
function layoutFor(archetype) {
  switch (archetype) {
    case 'sidebar-left': return { kind: 'sidebar', side: 'left' }
    case 'sidebar-right': return { kind: 'sidebar', side: 'right' }
    case 'header-band': return { kind: 'band' }
    case 'creative': return { kind: 'creative' }
    case 'twocol': return { kind: 'twocol' }
    case 'compact': return { kind: 'twocol', dense: true }
    case 'timeline': return { kind: 'single', timeline: true }
    case 'boxed': return { kind: 'single', boxed: true }
    case 'minimal': return { kind: 'single', align: 'left', minimal: true }
    default: return { kind: 'single', align: 'center' }
  }
}

// Libellés de sections (français).
const L = {
  profil: 'Profil', objectif: 'Objectif', exp: 'Expériences professionnelles',
  form: 'Formation', comp: 'Compétences', langues: 'Langues', interets: "Centres d'intérêt",
  contact: 'Contact', reseaux: 'Réseaux',
}

export default function CvDocument({ design, answers, editable = false, onField = () => {}, scale }) {
  const { palette: p, fonts: f, opts: o } = design
  const a = answers
  const layout = layoutFor(design.archetype)

  const fullName = [a.prenom, a.nom].filter(Boolean).join(' ')
  const initials = ((a.prenom || '')[0] || '') + ((a.nom || '')[0] || '')

  // --- Titre de section paramétré par o.headingStyle ---
  const Title = ({ children, color = p.heading, onSidebar = false }) => {
    const txt = o.headingUpper ? String(children).toUpperCase() : children
    const st = { fontFamily: f.heading, fontSize: 12.5, fontWeight: 700, letterSpacing: o.headingUpper ? 1.2 : 0, color, margin: '0 0 8px' }
    if (o.headingStyle === 'plain') return <div style={{ ...st, letterSpacing: (o.letterSpacing || 1) }}>{txt}</div>
    if (o.headingStyle === 'bar') return <div style={{ ...st, paddingLeft: 10, borderLeft: `3px solid ${color}` }}>{txt}</div>
    if (o.headingStyle === 'boxed') return <div style={{ ...st, display: 'inline-block', padding: '3px 10px', border: `1.5px solid ${color}`, borderRadius: 4 }}>{txt}</div>
    if (o.headingStyle === 'pill') return <div style={{ ...st, display: 'inline-block', padding: '3px 12px', background: onSidebar ? rgba('#ffffff', .16) : rgba(color, .12), borderRadius: 999 }}>{txt}</div>
    // underline (défaut)
    return <div style={{ ...st, paddingBottom: 5, borderBottom: `2px solid ${color}`, display: 'block' }}>{txt}</div>
  }

  const Section = ({ title, children, color, onSidebar, boxed }) => {
    const inner = <>{title && <Title color={color} onSidebar={onSidebar}>{title}</Title>}{children}</>
    if (boxed) return <div style={{ border: `1px solid ${p.line}`, borderRadius: 10, padding: '12px 14px', marginBottom: 12, background: '#fff' }}>{inner}</div>
    return <div style={{ marginBottom: o.dense ? 12 : 16 }}>{inner}</div>
  }

  // --- Blocs de champ ---
  const Avatar = ({ size = 92 }) => {
    const shape = o.photoShape === 'square' ? 4 : o.photoShape === 'rounded' ? 16 : '50%'
    if (a.photo) return <img src={a.photo} alt="" style={{ width: size, height: size, objectFit: 'cover', borderRadius: shape, border: `3px solid ${rgba('#ffffff', .6)}` }} />
    return (
      <div style={{ width: size, height: size, borderRadius: shape, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: p.accent2, color: readableOn(p.accent2), fontFamily: f.heading, fontWeight: 800, fontSize: size * 0.36 }}>
        {initials.toUpperCase() || '★'}
      </div>
    )
  }

  const contactRows = () => [
    a.email && ['✉', a.email, 'email'],
    a.telephone && ['✆', a.telephone, 'telephone'],
    a.ville && ['⌂', a.ville, 'ville'],
    a.portfolio && ['◈', a.portfolio, 'portfolio'],
  ].filter(Boolean)

  const ContactBlock = ({ onSidebar }) => {
    const col = onSidebar ? p.sidebarText : p.text
    const muted = onSidebar ? p.sidebarMuted : p.muted
    const rows = contactRows()
    if (!rows.length && !editable) return null
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11.5, color: col, fontFamily: f.body }}>
        {(editable ? [['✉', a.email, 'email', 'Email'], ['✆', a.telephone, 'telephone', 'Téléphone'], ['⌂', a.ville, 'ville', 'Ville'], ['◈', a.portfolio, 'portfolio', 'Portfolio']] : rows).map(([ic, val, key, ph], i) => (
          <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'baseline' }}>
            <span style={{ color: onSidebar ? p.sidebarText : p.accent, width: 14, flexShrink: 0 }}>{ic}</span>
            <Editable editable={editable} value={val} path={key} onField={onField} placeholder={ph} style={{ color: col, wordBreak: 'break-word' }} />
          </div>
        ))}
      </div>
    )
  }

  const SkillsBlock = ({ onSidebar }) => {
    const items = a.competences || []
    if (!items.length && !editable) return null
    const col = onSidebar ? p.sidebarText : p.text
    if (o.skillStyle === 'text') {
      return <div style={{ fontSize: 12, color: col, fontFamily: f.body, lineHeight: 1.7 }}>{items.join(' · ') || (editable ? '—' : '')}</div>
    }
    if (o.skillStyle === 'bar') {
      return <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {items.map((s, i) => (
          <div key={i}>
            <div style={{ fontSize: 11.5, color: col, fontFamily: f.body, marginBottom: 3 }}>{s}</div>
            <div style={{ height: 5, borderRadius: 3, background: onSidebar ? rgba('#ffffff', .2) : p.line }}>
              <div style={{ height: '100%', width: `${70 + ((i * 7) % 30)}%`, borderRadius: 3, background: onSidebar ? p.sidebarText : p.accent }} />
            </div>
          </div>
        ))}
      </div>
    }
    // chip (défaut)
    return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map((s, i) => (
        <span key={i} style={{ fontSize: 11, fontFamily: f.body, padding: '3px 9px', borderRadius: 999,
          background: onSidebar ? rgba('#ffffff', .16) : rgba(p.accent, .12), color: onSidebar ? p.sidebarText : mix(p.accent, '#000', .1) }}>{s}</span>
      ))}
    </div>
  }

  const LanguesBlock = ({ onSidebar }) => {
    const items = a.langues || []
    if (!items.length && !editable) return null
    const col = onSidebar ? p.sidebarText : p.text
    const dotOn = onSidebar ? p.sidebarText : p.accent
    const dotOff = onSidebar ? rgba('#ffffff', .28) : p.line
    return <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {items.map((l, i) => (
        <div key={l.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11.5, color: col, fontFamily: f.body }}>{l.langue}</span>
          <span style={{ display: 'flex', gap: 3 }}>
            {[0, 1, 2, 3, 4].map(d => (
              <span key={d} style={{ width: 7, height: 7, borderRadius: '50%', background: (d / 5) < langFrac(l.niveau) ? dotOn : dotOff }} />
            ))}
          </span>
        </div>
      ))}
    </div>
  }

  const InteretsBlock = ({ onSidebar }) => {
    const items = a.interets || []
    if (!items.length && !editable) return null
    const col = onSidebar ? p.sidebarText : p.text
    return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map((s, i) => (
        <span key={i} style={{ fontSize: 11, fontFamily: f.body, color: col,
          padding: '3px 8px', borderRadius: 6, border: `1px solid ${onSidebar ? p.sidebarLine : p.line}` }}>{s}</span>
      ))}
    </div>
  }

  const ReseauxBlock = ({ onSidebar }) => {
    const items = a.reseaux || []
    if (!items.length && !editable) return null
    const col = onSidebar ? p.sidebarText : p.text
    const muted = onSidebar ? p.sidebarMuted : p.muted
    return <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontFamily: f.body }}>
      {items.map((r, i) => (
        <div key={r.id || i}>
          <span style={{ fontWeight: 700, color: col }}>{r.label}</span>
          <span style={{ color: muted }}>{r.label && r.url ? ' — ' : ''}{r.url}</span>
        </div>
      ))}
    </div>
  }

  // Entrées d'expériences / formation (partagées).
  const EntryList = ({ list, path, timeline }) => {
    const items = a[list] || []
    if (!items.length && !editable) return null
    return <div style={{ position: 'relative', paddingLeft: timeline ? 18 : 0 }}>
      {timeline && <div style={{ position: 'absolute', left: 4, top: 4, bottom: 4, width: 2, background: p.line }} />}
      {items.map((it, i) => {
        const isExp = list === 'experiences'
        const title = isExp ? it.poste : it.intitule
        const org = isExp ? it.entreprise : it.ecole
        const period = [it.debut, it.fin].filter(Boolean).join(' — ')
        return (
          <div key={it.id || i} style={{ marginBottom: o.dense ? 9 : 13, position: 'relative' }}>
            {timeline && <div style={{ position: 'absolute', left: -18, top: 4, width: 10, height: 10, borderRadius: '50%', background: p.accent, border: '2px solid #fff' }} />}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
              <Editable editable={editable} value={title} path={`${path}.${i}.${isExp ? 'poste' : 'intitule'}`} onField={onField}
                tag="span" placeholder={isExp ? 'Poste' : 'Diplôme'} style={{ fontFamily: f.heading, fontWeight: 700, fontSize: 13, color: p.text }} />
              <span style={{ fontSize: 10.5, color: p.muted, fontFamily: f.body, whiteSpace: 'nowrap', flexShrink: 0 }}>{period}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', fontSize: 11.5, color: p.accent, fontFamily: f.body, fontWeight: 600 }}>
              <Editable editable={editable} value={org} path={`${path}.${i}.${isExp ? 'entreprise' : 'ecole'}`} onField={onField} tag="span"
                placeholder={isExp ? 'Entreprise' : 'École'} style={{ color: p.accent }} />
              {it.ville && <span style={{ color: p.muted, fontWeight: 400 }}>· {it.ville}</span>}
            </div>
            {(it.description || editable) && (
              <Editable editable={editable} value={it.description} path={`${path}.${i}.description`} onField={onField} multiline
                placeholder="Description…" style={{ fontSize: 11.5, color: p.text, fontFamily: f.body, lineHeight: 1.5, marginTop: 3, whiteSpace: 'pre-wrap' }} />
            )}
          </div>
        )
      })}
    </div>
  }

  const TextBlock = ({ value, path, placeholder }) => (
    (value || editable) ? <Editable editable={editable} value={value} path={path} onField={onField} multiline placeholder={placeholder}
      style={{ fontSize: 12, color: p.text, fontFamily: f.body, lineHeight: 1.55, whiteSpace: 'pre-wrap' }} /> : null
  )

  // --- Bloc nom / titre (grande accroche) ---
  const NameBlock = ({ align = 'left', onBand = false }) => {
    const col = onBand ? p.bandText : p.text
    const sub = onBand ? rgba(p.bandText, .85) : p.accent
    return (
      <div style={{ textAlign: align }}>
        <Editable editable={editable} value={fullName || (editable ? '' : ' ')} path="__name" onField={onField} placeholder="Prénom Nom"
          tag="div" style={{ fontFamily: f.heading, fontWeight: 800, fontSize: o.nameSize, lineHeight: 1.05, color: col,
            letterSpacing: o.nameUpper ? 2 : 0, textTransform: o.nameUpper ? 'uppercase' : 'none' }} />
        {(a.titre || editable) && (
          <Editable editable={editable} value={a.titre} path="titre" onField={onField} placeholder="Titre du CV" tag="div"
            style={{ fontFamily: f.body, fontSize: 14, fontWeight: 600, color: sub, marginTop: 5, letterSpacing: 0.5 }} />
        )}
      </div>
    )
  }

  // ---------------------------------------------------------------- Rendu par archetype
  const bodySections = ({ boxed, timeline } = {}) => (
    <>
      {(a.resume || editable) && <Section title={L.profil} boxed={boxed}><TextBlock value={a.resume} path="resume" placeholder="Votre résumé / accroche…" /></Section>}
      {(a.objectif || editable) && <Section title={L.objectif} boxed={boxed}><TextBlock value={a.objectif} path="objectif" placeholder="Votre objectif professionnel…" /></Section>}
      {(a.experiences?.length || editable) ? <Section title={L.exp} boxed={boxed}><EntryList list="experiences" path="experiences" timeline={timeline} /></Section> : null}
      {(a.diplomes?.length || editable) ? <Section title={L.form} boxed={boxed}><EntryList list="diplomes" path="diplomes" timeline={timeline} /></Section> : null}
    </>
  )
  const skillsSections = ({ boxed } = {}) => (
    <>
      {(a.competences?.length || editable) ? <Section title={L.comp} boxed={boxed}><SkillsBlock /></Section> : null}
      {(a.langues?.length || editable) ? <Section title={L.langues} boxed={boxed}><LanguesBlock /></Section> : null}
      {(a.interets?.length || editable) ? <Section title={L.interets} boxed={boxed}><InteretsBlock /></Section> : null}
      {(a.reseaux?.length || editable) ? <Section title={L.reseaux} boxed={boxed}><ReseauxBlock /></Section> : null}
    </>
  )

  let content
  if (layout.kind === 'sidebar') {
    const sidebar = (
      <div style={{ background: p.sidebarBg, color: p.sidebarText, padding: '26px 20px', width: '34%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}><Avatar size={104} /></div>
        <Section title={L.contact} color={p.sidebarHeading} onSidebar><ContactBlock onSidebar /></Section>
        {(a.competences?.length || editable) ? <Section title={L.comp} color={p.sidebarHeading} onSidebar><SkillsBlock onSidebar /></Section> : null}
        {(a.langues?.length || editable) ? <Section title={L.langues} color={p.sidebarHeading} onSidebar><LanguesBlock onSidebar /></Section> : null}
        {(a.interets?.length || editable) ? <Section title={L.interets} color={p.sidebarHeading} onSidebar><InteretsBlock onSidebar /></Section> : null}
        {(a.reseaux?.length || editable) ? <Section title={L.reseaux} color={p.sidebarHeading} onSidebar><ReseauxBlock onSidebar /></Section> : null}
      </div>
    )
    const main = (
      <div style={{ padding: '30px 28px', width: '66%', boxSizing: 'border-box' }}>
        <div style={{ marginBottom: 18 }}><NameBlock align="left" /></div>
        {bodySections({ timeline: layout.timeline })}
      </div>
    )
    content = <div style={{ display: 'flex', minHeight: A4_H }}>{layout.side === 'left' ? <>{sidebar}{main}</> : <>{main}{sidebar}</>}</div>
  } else if (layout.kind === 'band' || layout.kind === 'creative') {
    const creative = layout.kind === 'creative'
    content = (
      <div>
        <div style={{ background: p.band, color: p.bandText, padding: creative ? '34px 34px 30px' : '30px 34px',
          display: 'flex', alignItems: 'center', gap: 22, borderBottom: `4px solid ${p.accent2}` }}>
          <Avatar size={creative ? 96 : 84} />
          <div style={{ flex: 1 }}><NameBlock align="left" onBand /></div>
          <div style={{ minWidth: 150 }}><ContactBlock onSidebar={false} /></div>
        </div>
        <div style={{ display: 'flex', gap: 26, padding: '26px 30px' }}>
          <div style={{ flex: 1.7 }}>{bodySections({})}</div>
          <div style={{ flex: 1, borderLeft: `1px solid ${p.line}`, paddingLeft: 22 }}>{skillsSections({})}</div>
        </div>
      </div>
    )
  } else if (layout.kind === 'twocol') {
    content = (
      <div style={{ padding: layout.dense ? '26px 30px' : '32px 34px' }}>
        <div style={{ marginBottom: 18, paddingBottom: 14, borderBottom: `2px solid ${p.accent}` }}>
          <NameBlock align="left" />
          <div style={{ marginTop: 12 }}><ContactRow p={p} f={f} rows={contactRows()} editable={editable} a={a} onField={onField} /></div>
        </div>
        <div style={{ display: 'flex', gap: 26 }}>
          <div style={{ flex: 1.7 }}>{bodySections({})}</div>
          <div style={{ flex: 1, borderLeft: `1px solid ${p.line}`, paddingLeft: 22 }}>{skillsSections({})}</div>
        </div>
      </div>
    )
  } else {
    // single (classic / minimal / boxed / timeline)
    const align = layout.align || 'center'
    content = (
      <div style={{ padding: layout.minimal ? '40px 44px' : '34px 40px' }}>
        <div style={{ marginBottom: 20, textAlign: align, paddingBottom: layout.minimal ? 14 : 18,
          borderBottom: layout.minimal ? `1px solid ${p.line}` : `3px solid ${p.accent}` }}>
          <NameBlock align={align} />
          <div style={{ marginTop: 12, display: 'flex', justifyContent: align === 'center' ? 'center' : 'flex-start' }}>
            <ContactRow p={p} f={f} rows={contactRows()} editable={editable} a={a} onField={onField} />
          </div>
        </div>
        {bodySections({ boxed: layout.boxed, timeline: layout.timeline })}
        {skillsSections({ boxed: layout.boxed })}
      </div>
    )
  }

  const root = (
    <div className="cv-doc" style={{ width: A4_W, minHeight: A4_H, background: p.page, color: p.text,
      fontFamily: f.body, position: 'relative', overflow: 'hidden',
      transform: scale ? `scale(${scale})` : undefined, transformOrigin: 'top left' }}>
      <style>{`.cv-doc .cv-ed:empty:before{content:attr(data-ph);color:#9aa1ac;font-weight:400;}
        .cv-doc .cv-ed[contenteditable]{outline:none;}
        .cv-doc .cv-ed[contenteditable]:hover{background:${rgba(p.accent, .06)};border-radius:3px;}
        .cv-doc .cv-ed[contenteditable]:focus{background:${rgba(p.accent, .1)};border-radius:3px;box-shadow:0 0 0 2px ${rgba(p.accent, .3)};}`}</style>
      {content}
    </div>
  )
  return root
}

// Ligne de contact horizontale (archetypes single/twocol).
function ContactRow({ p, f, rows, editable, a, onField }) {
  const list = editable
    ? [['✉', a.email, 'email', 'Email'], ['✆', a.telephone, 'telephone', 'Téléphone'], ['⌂', a.ville, 'ville', 'Ville'], ['◈', a.portfolio, 'portfolio', 'Portfolio']]
    : rows.map(([ic, v, k]) => [ic, v, k, ''])
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 11.5, color: p.muted, fontFamily: f.body }}>
      {list.map(([ic, val, key, ph], i) => (
        <span key={i} style={{ display: 'inline-flex', gap: 5, alignItems: 'baseline' }}>
          <span style={{ color: p.accent }}>{ic}</span>
          <Editable2 editable={editable} value={val} path={key} onField={onField} placeholder={ph} color={p.text} />
        </span>
      ))}
    </div>
  )
}
function Editable2({ editable, value, path, onField, placeholder, color }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current && ref.current.innerText !== (value || '')) ref.current.innerText = value || '' }, [value])
  if (!editable) return value ? <span style={{ color }}>{value}</span> : null
  return <span ref={ref} className="cv-ed" contentEditable suppressContentEditableWarning data-ph={placeholder}
    style={{ color }} onBlur={e => onField(path, e.currentTarget.innerText.replace(/\n/g, ' ').trim())} />
}
