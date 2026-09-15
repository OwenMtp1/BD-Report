// La ressource et sa documentation, tenues par les faits.
// ⚠️ Un exemple de code dans un fichier .md ne se compile pas : il vieillit
// en silence, et le client qui le copie découvre qu'il ne marche plus. On
// vérifie donc que chaque rubrique du catalogue est soit émise par la
// ressource, soit documentée — et que chaque « cat » documenté est bien
// accepté par l'API, au lieu d'atterrir dans « Action staff ».
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
const B = process.env.BASE, KEY = process.env.KEY;
const T=[];const t=(n,ok,x='')=>{T.push([ok,n]);console.log((ok?'  ok    ':'  ÉCHEC ')+n+(x?'  → '+x:''));};
const sect=n=>console.log('\n── '+n+' '+'─'.repeat(Math.max(0,54-n.length)));

const RACINE = path.resolve(process.cwd());
const RES = path.join(RACINE, '..', 'resource');
const CAT = (await import(path.join(RACINE, 'catalogue.js'))).default
         || (await import('../catalogue.js')).default;
const cats = (await import('../catalogue.js')).CATS
          || (await import('../catalogue.js')).default.CATS;

function lireTout(dir) {
  let out = '';
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) out += lireTout(p);
    else if (/\.lua$/.test(f)) out += readFileSync(p, 'utf8');
  }
  return out;
}
const LUA = lireTout(RES);
const DOC = readFileSync(path.join(RES, 'EXEMPLES.md'), 'utf8');

const emises = new Set([...LUA.matchAll(/cat\s*=\s*'([a-z_]+)'/g)].map(m => m[1])
  .concat([...LUA.matchAll(/Origin\.(?:Info|Notice|Alerte|Critique)\('([a-z_]+)'/g)].map(m => m[1])));
// Une occurrence en COMMENTAIRE ne compte pas : c'est justement le piège.
const vraimentEmises = new Set([...emises].filter(c => {
  const re = new RegExp("^[^-\\n]*(cat\\s*=\\s*'" + c + "'|Origin\\.\\w+\\('" + c + "')", 'm');
  return re.test(LUA);
}));
const documentees = new Set([...DOC.matchAll(/cat\s*=\s*'([a-z_]+)'/g)].map(m => m[1]));
// Une rubrique peut aussi naître de l'API elle-même — « Écran du joueur »
// est posée à l'arrivée d'une capture, sans que le Lua la nomme.
const SRV = readFileSync(path.join(RACINE, 'server.js'), 'utf8');
const parApi = new Set([...SRV.matchAll(/cat:\s*'([a-z_]+)'/g)].map(m => m[1]));

sect('Chaque rubrique a une origine');
const orphelines = cats.map(c => c.id)
  .filter(id => !vraimentEmises.has(id) && !documentees.has(id) && !parApi.has(id));
t('⚠️ aucune rubrique sans émetteur ni exemple', orphelines.length === 0,
  orphelines.length ? orphelines.join(', ') : cats.length + ' rubriques couvertes');
t('la ressource en émet une part elle-même', vraimentEmises.size >= 8,
  [...vraimentEmises].sort().join(', '));
t('et les autres ont leur exemple à copier', documentees.size >= 8,
  [...documentees].sort().join(', '));

sect('Le tableau de la documentation dit vrai');
const inconnues = [...documentees].filter(c => !cats.some(x => x.id === c));
t('⚠️ aucun exemple ne cite une rubrique qui n’existe pas', inconnues.length === 0,
  inconnues.join(', '));

// ⚠️ Le piège vient d'AILLEURS que du fichier d'exemples. Le guide de
// déploiement enseignait « cat = 'braquages' » longtemps après le retrait
// de cette rubrique : celui qui copiait la ligne voyait son évènement
// atterrir dans « Action staff » sans comprendre pourquoi. On relit donc
// TOUS les documents, pas seulement celui qu'on vient d'écrire.
const DOCS = ['README.md', 'DEPLOIEMENT.md', 'resource/EXEMPLES.md', 'juridique/CONSERVATION.md']
  .map(f => [f, path.join(RACINE, '..', f)]);
const perimes = [];
for (const [nom, f] of DOCS) {
  const txt = readFileSync(f, 'utf8');
  for (const m of txt.matchAll(/cat\s*=\s*'([a-z_]+)'/g))
    if (!cats.some(x => x.id === m[1])) perimes.push(`${nom} : ${m[1]}`);
}
t('⚠️ aucun document n’enseigne une rubrique périmée', perimes.length === 0,
  perimes.length ? perimes.join(' · ') : DOCS.length + ' documents relus');
for (const id of ['boutique_caisse', 'casino', 'facture_ems', 'proprietes', 'items_sol', 'ecran_joueur', 'reports'])
  t(`« ${id} » figure au tableau récapitulatif`, DOC.includes('`' + id + '`'));

sect('Et l’API accepte chacune, sans la reclasser');
const envoi = cats.map((c, i) => ({ cat: c.id, sev: 'info',
  msg: 'contrôle de rubrique ' + c.id, actor: { key: 'license:cat' + i, name: 'Sonde' + i, sid: i } }));
const r = await fetch(B + '/api/ingest', { method:'POST',
  headers:{'content-type':'application/json','x-origin-key':KEY}, body: JSON.stringify({ events: envoi }) });
const j = await r.json();
t(`les ${cats.length} rubriques sont déposées`, j.recus === cats.length, j.recus + ' reçus');

const r0 = await fetch(B+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({pseudo:'Nyx',password:'motdepassetest123'})});
const ck = (r0.headers.get('set-cookie')||'').split(';')[0];
let bonnes = 0, ratees = [];
for (const c of cats) {
  const q = await fetch(B + '/api/events?cat=' + c.id + '&limit=50', { headers:{cookie:ck} });
  const b = await q.json();
  const trouve = (b.events || []).some(e => e.msg === 'contrôle de rubrique ' + c.id);
  if (trouve) bonnes++; else ratees.push(c.id);
}
t('⚠️ chacune atterrit dans SA rubrique, pas dans « Action staff »',
  bonnes === cats.length, ratees.length ? 'manquent : ' + ratees.join(', ') : bonnes + '/' + cats.length);

const faux = await fetch(B + '/api/ingest', { method:'POST',
  headers:{'content-type':'application/json','x-origin-key':KEY},
  body: JSON.stringify({ events:[{ cat:'rubrique_inventee', sev:'info', msg:'faute de frappe dans un script',
    actor:{ key:'license:zz', name:'Sonde', sid:99 } }] }) });
t('une rubrique inconnue est acceptée', (await faux.json()).recus === 1);
const adm = await (await fetch(B + '/api/events?cat=admin&limit=50', { headers:{cookie:ck} })).json();
t('⚠️ et rattachée à « Action staff » plutôt que perdue',
  (adm.events||[]).some(e => e.msg === 'faute de frappe dans un script'));

sect('Les documents RGPD citent les vrais chiffres');
// ⚠️ Un registre de conservation qui annonce 30 jours quand le code en
// applique 90 est pire qu'absent : il fait répondre faux à un joueur, et
// c'est la réponse qui engage. Les chiffres se vérifient donc, comme le reste.
const JUR = path.join(RACINE, '..', 'juridique');
const CONS = readFileSync(path.join(JUR, 'CONSERVATION.md'), 'utf8');
const nombreApres = (txt, motif) => {
  const m = txt.match(motif); return m ? Number(m[1]) : null;
};
const retenue = nombreApres(SRV, /retention:\s*Number\(process\.env\.RETENTION_DAYS\s*\|\|\s*(\d+)\)/);
const sessions = nombreApres(SRV, /sessionDays:Number\(process\.env\.SESSION_DAYS\s*\|\|\s*(\d+)\)/);
const auditJ  = nombreApres(SRV, /auditDays:\s*Number\(process\.env\.AUDIT_DAYS \|\| (\d+)\)/);
const garde   = nombreApres(readFileSync(path.join(RACINE, 'sauvegarde.js'), 'utf8'),
                            /BACKUP_KEEP\s*\|\|\s*(\d+)/);
t('la rétention par défaut est celle annoncée', retenue === 30 && CONS.includes('**30 jours** par défaut'),
  'code ' + retenue + ' j');
t('la durée des sessions aussi', sessions === 7 && /Sessions de connexion au panneau \| 7 jours/.test(CONS),
  'code ' + sessions + ' j');
t('le nombre de sauvegardes gardées aussi', garde === 14 && CONS.includes('14 fichiers'),
  'code ' + garde);
t('⚠️ et la durée du journal d’administration, que rien d’autre ne rappelle',
  auditJ === 180 && CONS.includes('**180 jours**'), 'code ' + auditJ + ' j');
t('chaque modèle porte son avertissement de relecture',
  ['SOUS-TRAITANCE.md', 'MENTION-JOUEURS.md', 'CONSERVATION.md']
    .every(f => /MODÈLE À FAIRE RELIRE PAR UN JURISTE/.test(readFileSync(path.join(JUR, f), 'utf8'))));
t('⚠️ le registre dit que les sauvegardes survivent à l’effacement',
  /sauvegarde/i.test(CONS) && /rotation/.test(CONS));

const n=T.filter(([o])=>o).length;
console.log(`\n  ${n}/${T.length} contrôles passés`);
process.exit(n===T.length?0:1);
