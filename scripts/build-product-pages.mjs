// Génère les pages produit du site (site/produit/<slug>.html) — FR par défaut, EN via bascule.
import { mkdirSync, writeFileSync } from 'fs'

const CATS = [
  {
    slug: 'pilotage', emoji: '📈',
    fr: {
      name: 'Pilotage', title: 'Vos chiffres décident, pas votre intuition',
      pitch: "Chaque RDV, chaque SQL, chaque euro de prime alimente des dashboards lisibles en un coup d'œil. Timelines flexibles, drill-down sur chaque chiffre, rapports prêts pour votre 1:1 — BD Report transforme votre activité brute en décisions.",
      points: [
        ['Tout est cliquable', "Un chiffre vous intrigue ? Cliquez : la liste des rendez-vous derrière apparaît, filtrée sur la période affichée."],
        ['Des objectifs qui vivent', "Quotas hebdo et mensuels avec barres de progression et alerte de retard — vous savez chaque matin où vous en êtes."],
        ['Le rapport prêt à présenter', 'Hebdo, mensuel, trimestriel ou annuel : vos 6 indicateurs clés avec variation vs période précédente, exportables en PDF.'],
      ],
      shots: [['dashboard', 'Le dashboard : RDV pris / réalisés, MQL, SQL, primes, jauges de performance — widgets réorganisables.'], ['teamlead', "Pilotage équipe : forecast du mois avec projection, daily standup et alertes de dérive automatiques."]],
      feats: ['Dashboards complets avec timelines et drill-down', 'Objectifs & quotas à barres de progression', 'Rapports périodiques exportables en PDF', 'Vélocité du pipeline et goulots identifiés', 'Dashboards générés par prompt IA', 'Mode présentation plein écran'],
    },
    en: {
      name: 'Steering', title: 'Your numbers decide, not your gut',
      pitch: 'Every meeting, every SQL, every bonus euro feeds dashboards you can read at a glance. Flexible timelines, drill-down on every number, reports ready for your 1:1 — BD Report turns raw activity into decisions.',
      points: [
        ['Everything is clickable', 'A number intrigues you? Click it: the meetings behind it appear, filtered on the displayed period.'],
        ['Goals that live', 'Weekly and monthly quotas with progress bars and late warnings — you know where you stand every morning.'],
        ['The report ready to present', 'Weekly, monthly, quarterly or yearly: your 6 key metrics with deltas vs the previous period, exportable to PDF.'],
      ],
      shots: [['dashboard', 'The dashboard: booked / held meetings, MQL, SQL, bonuses, performance gauges — reorderable widgets.'], ['teamlead', 'Team steering: monthly forecast with projection, daily standup and automatic drift alerts.']],
      feats: ['Full dashboards with timelines and drill-down', 'Goals & quotas with progress bars', 'Periodic reports exportable to PDF', 'Pipeline velocity and bottleneck detection', 'AI prompt-built dashboards', 'Full-screen presentation mode'],
    },
  },
  {
    slug: 'activite', emoji: '📅',
    fr: {
      name: 'Activité', title: 'Votre journée de prospection, sans friction',
      pitch: "Créer un RDV prend 20 secondes, le faire suivre 5. Sous-rendez-vous pré-remplis, automatisations de phases, calendrier multi-vues et tâches priorisées : BD Report enlève l'administratif pour vous laisser au téléphone.",
      points: [
        ['Le RDV intelligent', "Contacts multiples, LinkedIn, secteur, notes — et le rendez-vous suivant se pré-remplit tout seul. Les doublons sont détectés avant d'exister."],
        ['Des automatisations métier', 'Gagnée → SQL, Perdue → KO avec motif, date de passage SQL demandée au bon moment : la donnée reste propre sans effort.'],
        ['Votre to-do triée par impact', 'No-shows à replanifier, opportunités à pousser, leads perdus à relancer après 6 mois : la page Tâches prioritaires pense pour vous.'],
      ],
      shots: [['rdv', 'Mes Rendez-vous : tous les champs, filtres et tris, sous-RDV repliés sous leur parent.'], ['calendar', 'Le calendrier multi-vues : jour, semaine, mois, année — coloré par phase.'], ['tasks', 'Tâches prioritaires : no-shows, opportunités en cours, leads à relancer.']],
      feats: ['RDV complets avec contacts multiples et champs configurables', 'Calendrier jour / semaine / mois / année', 'Tâches prioritaires automatiques', 'Automatisations de phases et de statuts', 'Motifs de perte et de no-show guidés', 'Assistant intégré en langage naturel'],
    },
    en: {
      name: 'Activity', title: 'Your prospecting day, friction-free',
      pitch: 'Creating a meeting takes 20 seconds, the follow-up 5. Pre-filled follow-up meetings, stage automations, multi-view calendar and prioritized tasks: BD Report removes the admin so you stay on the phone.',
      points: [
        ['The smart meeting', 'Multiple contacts, LinkedIn, industry, notes — and the follow-up meeting pre-fills itself. Duplicates are caught before they exist.'],
        ['Business automations', 'Won → SQL, Lost → KO with a reason, SQL date requested at the right moment: clean data, zero effort.'],
        ['A to-do sorted by impact', 'No-shows to rebook, opportunities to push, lost leads to revive after 6 months: the Priority tasks page thinks for you.'],
      ],
      shots: [['rdv', 'Meetings: every field, filter and sort, follow-ups nested under their parent.'], ['calendar', 'The multi-view calendar: day, week, month, year — colored by stage.'], ['tasks', 'Priority tasks: no-shows, open opportunities, leads to revive.']],
      feats: ['Full meetings with multiple contacts and configurable fields', 'Day / week / month / year calendar', 'Automatic priority tasks', 'Stage and status automations', 'Guided loss and no-show reasons', 'Built-in natural-language assistant'],
    },
  },
  {
    slug: 'pipeline', emoji: '🧲',
    fr: {
      name: 'Pipeline', title: 'Un kanban qui dit la vérité',
      pitch: "Une carte par entreprise — jamais de doublon. Glissez, déposez, et les phases se mettent à jour toutes seules. La timeline de vie de chaque lead vous dit où ça bloque, l'alerte de conflit vous évite d'appeler le compte d'un collègue.",
      points: [
        ['Par entreprise, pas par RDV', "Trois rendez-vous chez la même société = une seule carte, avec l'historique fusionné. Votre pipeline reflète la réalité commerciale."],
        ['La fiche 360°', "Tous les RDV, contacts, notes et commentaires d'équipe d'un compte sur une seule fiche, enrichissable (CA, site, LinkedIn, localisation)."],
        ['Zéro collision', "Si un collègue travaille déjà l'entreprise que vous saisissez, BD Report vous le dit immédiatement — avec ses commentaires en évidence."],
      ],
      shots: [['leads', "Le pipeline entreprise : la vue partagée de toute l'organisation, avec propriétaire et commentaires."], ['company', 'La fiche entreprise : RDV, contacts, infos société et fil de commentaires d\'équipe.']],
      feats: ['Kanban par entreprise sans doublon, drag & drop tactile', 'Timeline de vie du lead phase par phase', 'Alertes doublons et conflits de comptes', 'Fiche entreprise 360° enrichissable', 'Recherche globale Ctrl+K', 'Contacts auto-alimentés avec imports/exports'],
    },
    en: {
      name: 'Pipeline', title: 'A kanban that tells the truth',
      pitch: 'One card per company — never a duplicate. Drag, drop, and stages update themselves. Each lead\'s lifetime timeline shows where things stall, and conflict alerts keep you from calling a teammate\'s account.',
      points: [
        ['By company, not by meeting', 'Three meetings at the same company = one card, with merged history. Your pipeline reflects commercial reality.'],
        ['The 360° account view', 'Every meeting, contact, note and team comment for an account on one page, enrichable (revenue, website, LinkedIn, location).'],
        ['Zero collisions', 'If a teammate already works the company you\'re typing, BD Report tells you instantly — with their comments highlighted.'],
      ],
      shots: [['leads', 'The company pipeline: the shared organization view, with owner and comments.'], ['company', 'The account page: meetings, contacts, company info and the team comment thread.']],
      feats: ['Company kanban with no duplicates, touch drag & drop', 'Lead lifetime timeline stage by stage', 'Duplicate and account-conflict alerts', 'Enrichable 360° account view', 'Ctrl+K global search', 'Auto-fed contacts with imports/exports'],
    },
  },
  {
    slug: 'remuneration', emoji: '💶',
    fr: {
      name: 'Rémunération', title: 'Vos primes, calculées au centime et gravées dans le marbre',
      pitch: "Le barème est configurable (tranches d'effectif × source), la règle du 15 est automatique, et chaque prime est figée au barème en vigueur au moment du passage en SQL. Fini les discussions de fin de mois avec la compta.",
      points: [
        ['La règle du 15, sans calcul', 'Passage en SQL avant le 15 : payé ce mois-ci. Après : le mois suivant. BD Report classe chaque prime dans le bon mois, tout seul.'],
        ['Le passé ne bouge plus', "Changer le barème en mars ne réécrit pas les primes de janvier : chaque prime est versionnée 🔒 à la date de son passage en SQL."],
        ['Voir venir l\'argent', "Le prévisionnel pondère vos opportunités en cours par leur probabilité de phase : vous savez ce que le mois prochain peut rapporter."],
      ],
      shots: [['primes', 'Primes & Commissions : suivi graphique, reporting détaillé, barème éditable et prévisionnel pondéré.']],
      feats: ["Barème configurable : tranches d'effectif × lead source", 'Primes versionnées, figées au passage en SQL', 'Règle du 15 automatique', 'Prévisionnel pondéré par phase', 'Suivi graphique par mois de paiement', "Répartition analytique sources × effectifs"],
    },
    en: {
      name: 'Compensation', title: 'Your bonuses, computed to the cent and set in stone',
      pitch: 'The grid is configurable (headcount brackets × source), the 15th rule is automatic, and each bonus is frozen at the grid in force when the lead turned SQL. No more end-of-month debates with finance.',
      points: [
        ['The 15th rule, no math', 'SQL before the 15th: paid this month. After: next month. BD Report files every bonus in the right month by itself.'],
        ['The past never changes', 'Changing the grid in March doesn\'t rewrite January\'s bonuses: each bonus is versioned 🔒 at its SQL date.'],
        ['See the money coming', 'The forecast weights your open opportunities by stage probability: you know what next month could pay.'],
      ],
      shots: [['primes', 'Bonuses & commissions: visual tracking, detailed reporting, editable grid and weighted forecast.']],
      feats: ['Configurable grid: headcount brackets × lead source', 'Versioned bonuses, frozen at SQL', 'Automatic 15th rule', 'Stage-weighted forecast', 'Visual tracking by payout month', 'Sources × headcount analytics'],
    },
  },
  {
    slug: 'collaboration', emoji: '🤝',
    fr: {
      name: 'Collaboration', title: "L'équipe joue enfin sur le même terrain",
      pitch: "Pipeline partagé en lecture pour tous, commentaires et @mentions sur les comptes, pilotage manager avec forecast et standup, réassignation de leads en 3 clics : BD Report fait travailler l'équipe comme une seule machine.",
      points: [
        ['Qui travaille quoi, visible', "Le pipeline entreprise agrège les comptes de toute l'organisation avec leur propriétaire — les conflits se voient avant de se produire."],
        ['Des conversations qui restent', "Les commentaires vivent sur la fiche du compte, pas dans un chat qui défile. Mentionnez @Sarah : elle est notifiée dans son espace."],
        ['Le manager outillé', 'Forecast avec projection de fin de mois, daily standup en 30 secondes, alertes de dérive automatiques et réassignation tracée.'],
      ],
      shots: [['teamlead', 'Pilotage équipe : forecast, standup, alertes et réassignation.'], ['orgchart', "L'organigramme hiérarchique : managers et équipes, avec photos."], ['company', 'Le fil de commentaires d\'équipe avec @mentions sur chaque compte.']],
      feats: ['Pipeline entreprise partagé en lecture', 'Commentaires & @mentions avec notifications', 'Pilotage équipe : forecast, standup, alertes', 'Réassignation de leads tracée', 'Organigramme hiérarchique', 'Rôles et permissions par briques'],
    },
    en: {
      name: 'Collaboration', title: 'The team finally plays on the same field',
      pitch: 'Read-only shared pipeline for everyone, comments and @mentions on accounts, manager steering with forecast and standup, lead reassignment in 3 clicks: BD Report makes the team run like one machine.',
      points: [
        ['Who works what, visible', 'The company pipeline aggregates accounts across the organization with their owner — conflicts are seen before they happen.'],
        ['Conversations that stay', 'Comments live on the account page, not in a scrolling chat. Mention @Sarah: she\'s notified in her workspace.'],
        ['The equipped manager', 'Forecast with end-of-month projection, 30-second daily standup, automatic drift alerts and logged reassignment.'],
      ],
      shots: [['teamlead', 'Team steering: forecast, standup, alerts and reassignment.'], ['orgchart', 'The hierarchical org chart: managers and teams, with photos.'], ['company', 'The team comment thread with @mentions on every account.']],
      feats: ['Read-only shared company pipeline', 'Comments & @mentions with notifications', 'Team steering: forecast, standup, alerts', 'Logged lead reassignment', 'Hierarchical org chart', 'Roles and per-brick permissions'],
    },
  },
  {
    slug: 'donnees', emoji: '🗄️',
    fr: {
      name: 'Données', title: 'Votre donnée commerciale, propre et sous contrôle',
      pitch: "Contacts auto-alimentés à chaque RDV, exports CSV et Excel filtrés, logs d'audit horodatés, corbeille 30 jours et sauvegarde complète : votre donnée est un actif, BD Report la traite comme tel.",
      points: [
        ['Un répertoire qui se remplit seul', "Chaque contact de RDV rejoint automatiquement Mes contacts, dédupliqué. Import CSV, export CSV/Excel — filtré ou complet."],
        ['Tout est tracé', "Création, modification, suppression, passage en SQL, réassignation : chaque action est horodatée dans les logs, filtrables par tâche et par date."],
        ['Rien ne se perd', 'Suppression accidentelle ? La corbeille garde tout 30 jours. Besoin de migrer ? La sauvegarde JSON emporte tout.'],
      ],
      shots: [['contacts', 'Mes contacts : recherche, filtres, sélection, exports CSV et Excel.'], ['logs', "Les logs d'audit : chaque action horodatée, filtrable par tâche et par période."]],
      feats: ['Multi-environnements étanches protégés par PIN', "Logs d'audit filtrables", 'Corbeille restaurable 30 jours', 'Sauvegarde & restauration JSON', '20 thèmes dont 10 ambiances animées', 'PWA installable, fonctionne hors-ligne'],
    },
    en: {
      name: 'Data', title: 'Your sales data, clean and under control',
      pitch: 'Contacts auto-fed from every meeting, filtered CSV and Excel exports, timestamped audit logs, 30-day trash and full backup: your data is an asset, BD Report treats it like one.',
      points: [
        ['An address book that fills itself', 'Every meeting contact joins your address book automatically, deduplicated. CSV import, CSV/Excel export — filtered or complete.'],
        ['Everything is traced', 'Creation, edits, deletion, SQL transitions, reassignment: every action is timestamped in the logs, filterable by task and date.'],
        ['Nothing gets lost', 'Accidental deletion? The trash keeps everything for 30 days. Need to migrate? The JSON backup carries it all.'],
      ],
      shots: [['contacts', 'Contacts: search, filters, selection, CSV and Excel exports.'], ['logs', 'Audit logs: every action timestamped, filterable by task and period.']],
      feats: ['Sealed multi-environments protected by PIN', 'Filterable audit logs', '30-day restorable trash', 'JSON backup & restore', '20 themes including 10 animated moods', 'Installable PWA, works offline'],
    },
  },
]

const navProduct = (cur) => CATS.map(c =>
  `<a href="${c.slug}.html" class="${c.slug === cur ? 'cur' : ''}">${c.emoji} <span data-i18n="cat.${c.slug}">${c.fr.name}</span></a>`).join('')

const page = (cat) => `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>BD Report — ${cat.fr.name} : ${cat.fr.title}</title>
<meta name="description" content="${cat.fr.pitch.slice(0, 150)}">
<link rel="icon" type="image/svg+xml" href="../app/icon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--brand:#3B5BDB;--cyan:#0EA5E9;--ink:#172033;--night:#10162E;--muted:#647085;--line:#E2E6EE;--surface:#F4F6FA;--mint:#10B981}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;color:var(--ink);background:#fff;line-height:1.6}
a{color:inherit;text-decoration:none}
.wrap{max-width:1080px;margin:0 auto;padding:0 24px}
.btn{display:inline-flex;align-items:center;gap:8px;padding:11px 22px;border-radius:12px;font-weight:700;font-size:15px;cursor:pointer;border:none;transition:.2s}
.btn-primary{background:linear-gradient(135deg,var(--brand),var(--cyan));color:#fff;box-shadow:0 6px 20px rgba(59,91,219,.35)}
.btn-primary:hover{transform:translateY(-2px)}
nav{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.9);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.nav-in{display:flex;align-items:center;gap:24px;height:64px}
.logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:19px;letter-spacing:-.5px}
.logo b{color:var(--brand)}
.nav-right{margin-left:auto;display:flex;align-items:center;gap:14px}
.lang-btn{border:1.5px solid var(--line);background:#fff;border-radius:10px;padding:6px 11px;font-weight:700;font-size:13px;cursor:pointer}
.cat-tabs{display:flex;gap:4px;overflow-x:auto;border-bottom:1px solid var(--line);background:#fff}
.cat-tabs .wrap{display:flex;gap:4px;padding:0 24px}
.cat-tabs a{padding:13px 16px;font-weight:700;font-size:14px;color:var(--muted);border-bottom:2.5px solid transparent;white-space:nowrap}
.cat-tabs a.cur{color:var(--brand);border-color:var(--brand)}
.cat-tabs a:hover{color:var(--brand)}
.hero{background:linear-gradient(135deg,var(--night),#1E2A52 60%,#14346B);color:#fff;padding:64px 0}
.hero .chip{display:inline-block;padding:5px 14px;border-radius:999px;font-size:13px;font-weight:700;background:rgba(94,220,255,.15);color:#5EDCFF}
.hero h1{font-size:38px;font-weight:800;letter-spacing:-1px;line-height:1.15;margin:14px 0;max-width:760px}
.hero p{color:rgba(255,255,255,.72);font-size:17px;max-width:680px}
section{padding:56px 0}
.points{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.point{background:var(--surface);border-radius:16px;padding:24px}
.point h3{font-size:16.5px;font-weight:800;margin-bottom:7px;color:var(--brand)}
.point p{font-size:14.5px;color:var(--muted)}
.shot{margin:46px 0}
.shot img{width:100%;border-radius:16px;border:1px solid var(--line);box-shadow:0 24px 60px rgba(23,32,51,.14)}
.shot figcaption{text-align:center;color:var(--muted);font-size:13.5px;margin-top:12px;font-weight:600}
.featlist{display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:760px;margin:0 auto}
.featlist li{list-style:none;background:#fff;border:1px solid var(--line);border-radius:12px;padding:13px 16px;font-size:14.5px;font-weight:600}
.featlist li::before{content:'✓';color:var(--mint);font-weight:800;margin-right:10px}
.cta{background:var(--night);color:#fff;text-align:center;border-radius:24px;padding:48px 24px;margin:30px 0 60px}
.cta h2{font-size:28px;font-weight:800;letter-spacing:-.6px}
.cta p{color:rgba(255,255,255,.65);margin:10px 0 24px}
h2.sec{font-size:26px;font-weight:800;letter-spacing:-.6px;text-align:center;margin-bottom:30px}
footer{border-top:1px solid var(--line);padding:22px 0;font-size:13.5px;color:var(--muted)}
.foot{display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px}
@media(max-width:860px){.points{grid-template-columns:1fr}.featlist{grid-template-columns:1fr}.hero h1{font-size:29px}}
</style>
</head>
<body>
<nav>
  <div class="wrap nav-in">
    <a class="logo" href="../index.html">
      <svg width="30" height="30" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B5BDB"/><stop offset="1" stop-color="#0EA5E9"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="url(#g)"/><rect x="13" y="34" width="9" height="17" rx="4.5" fill="#fff" opacity=".75"/><rect x="27" y="26" width="9" height="25" rx="4.5" fill="#fff" opacity=".9"/><rect x="41" y="16" width="9" height="35" rx="4.5" fill="#fff"/><circle cx="45.5" cy="11" r="4" fill="#A7F3D0"/></svg>
      <span><b>BD</b> Report</span>
    </a>
    <div class="nav-right">
      <a href="../index.html#tarifs" style="font-weight:600;font-size:14px;color:var(--muted)" data-i18n="nav.pricing">Tarifs</a>
      <a href="../index.html#contact" style="font-weight:600;font-size:14px;color:var(--muted)" data-i18n="nav.contact">Contact</a>
      <button class="lang-btn" id="langBtn" onclick="toggleLang()">🇬🇧 EN</button>
      <a class="btn btn-primary" href="../app/" data-i18n="nav.login">Se connecter</a>
    </div>
  </div>
</nav>
<div class="cat-tabs"><div class="wrap">${navProduct(cat.slug)}</div></div>

<header class="hero">
  <div class="wrap">
    <span class="chip">${cat.emoji} <span data-i18n="hero.cat">${cat.fr.name}</span></span>
    <h1 data-i18n="hero.title">${cat.fr.title}</h1>
    <p data-i18n="hero.pitch">${cat.fr.pitch}</p>
  </div>
</header>

<section>
  <div class="wrap">
    <div class="points">
      ${cat.fr.points.map((p, i) => `<div class="point"><h3 data-i18n="pt.${i}.t">${p[0]}</h3><p data-i18n="pt.${i}.d">${p[1]}</p></div>`).join('\n      ')}
    </div>
    ${cat.fr.shots.map((s, i) => `<figure class="shot"><img src="../assets/${s[0]}.png" alt="${s[1]}" loading="lazy"><figcaption data-i18n="shot.${i}">${s[1]}</figcaption></figure>`).join('\n    ')}
    <h2 class="sec" data-i18n="sec.feats">Tout ce que cette brique inclut</h2>
    <ul class="featlist">
      ${cat.fr.feats.map((f, i) => `<li data-i18n="ft.${i}">${f}</li>`).join('\n      ')}
    </ul>
  </div>
</section>

<div class="wrap">
  <div class="cta">
    <h2 data-i18n="cta.title">Essayez BD Report dès aujourd'hui</h2>
    <p data-i18n="cta.sub">Rejoignez la bêta exclusive — places limitées.</p>
    <a class="btn btn-primary" href="../app/" data-i18n="cta.btn">Se connecter à mon espace</a>
  </div>
</div>

<footer><div class="wrap foot">
  <span>© 2026 <b style="color:var(--brand)">BD</b> Report</span>
  <span><a href="../index.html" style="color:var(--brand);font-weight:700" data-i18n="foot.back">← Retour au site</a></span>
</div></footer>

<script>
const EN = ${JSON.stringify({
  'nav.pricing': 'Pricing', 'nav.contact': 'Contact', 'nav.login': 'Log in',
  'hero.cat': cat.en.name, 'hero.title': cat.en.title, 'hero.pitch': cat.en.pitch,
  ...Object.fromEntries(cat.en.points.flatMap((p, i) => [[`pt.${i}.t`, p[0]], [`pt.${i}.d`, p[1]]])),
  ...Object.fromEntries(cat.en.shots.map((s, i) => [`shot.${i}`, s[1]])),
  ...Object.fromEntries(cat.en.feats.map((f, i) => [`ft.${i}`, f])),
  'sec.feats': 'Everything this brick includes',
  'cta.title': 'Try BD Report today', 'cta.sub': 'Join the exclusive beta — limited seats.', 'cta.btn': 'Log in to my workspace',
  'foot.back': '← Back to the site',
  ...Object.fromEntries(CATS.map(c => [`cat.${c.slug}`, c.en.name])),
}, null, 0)}
let lang = localStorage.getItem('bdr_site_lang') || 'fr'
const FR = {}
document.querySelectorAll('[data-i18n]').forEach(el => FR[el.dataset.i18n] = el.innerHTML)
function applyLang(){
  document.documentElement.lang = lang
  document.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = lang === 'fr' ? FR[el.dataset.i18n] : (EN[el.dataset.i18n] ?? FR[el.dataset.i18n]) })
  document.getElementById('langBtn').textContent = lang === 'fr' ? '🇬🇧 EN' : '🇫🇷 FR'
}
function toggleLang(){ lang = lang === 'fr' ? 'en' : 'fr'; localStorage.setItem('bdr_site_lang', lang); applyLang() }
applyLang()
</script>
</body>
</html>`

mkdirSync('site/produit', { recursive: true })
CATS.forEach(cat => writeFileSync(`site/produit/${cat.slug}.html`, page(cat)))
console.log('PRODUCT PAGES OK:', CATS.map(c => c.slug).join(', '))
