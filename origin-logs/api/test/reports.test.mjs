// « Logs des Reports » — la rubrique, et son arrivée dans les espaces
// DÉJÀ LIVRÉS. C'est le second point qui compte : une rubrique ajoutée au
// catalogue n'existe pour personne tant que les rôles en base ne la
// portent pas, et les rôles en base ne se ré-ensemencent jamais.
import { readFileSync } from 'node:fs';
import path from 'node:path';
const B = process.env.BASE, KEY = process.env.KEY;
const T=[];const t=(n,ok,x='')=>{T.push([ok,n]);console.log((ok?'  ok    ':'  ÉCHEC ')+n+(x?'  → '+x:''));};
const sect=n=>console.log('\n── '+n+' '+'─'.repeat(Math.max(0,54-n.length)));
let ck='';
const J=async(p,o={},c)=>{const r=await fetch(B+p,{redirect:'manual',...o,headers:{'content-type':'application/json',cookie:c!==undefined?c:ck,...(o.headers||{})}});
  return {status:r.status, body:await r.json().catch(()=>null), r};};

const r0 = await fetch(B+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({pseudo:'Nyx',password:'motdepassetest123'})});
ck = (r0.headers.get('set-cookie')||'').split(';')[0];

sect('La rubrique existe et se range en modération');
const cat = await J('/api/catalogue');
const rep = (cat.body.cats||[]).find(c => c.id === 'reports');
t('« Logs des Reports » est au catalogue', !!rep, rep && rep.label);
t('elle porte son sigle', rep && rep.code === 'RPT', rep && rep.code);
t('elle est rangée avec la modération', rep && rep.group === 'moderation', rep && rep.group);
t('sa description dit les trois questions',
  rep && /pris/.test(rep.desc) && /refus/.test(rep.desc) && /signal/i.test(rep.desc), rep && rep.desc);

sect('Les quatre moments d’un ticket');
const T0 = Date.now();
const ev = [
  { cat:'reports', sev:'notice', msg:'Luca Ferraro a ouvert un report — RDM sur Legion',
    actor:{key:'license:joueur1',name:'Luca Ferraro',sid:12},
    data:{kind:'ouverture',ticket:'#412',motif:'RDM sur Legion'} },
  { cat:'reports', sev:'info', msg:'Nyx a pris le report de Luca Ferraro',
    actor:{key:'license:staff1',name:'Nyx',sid:2,staff:true},
    target:{key:'license:joueur1',name:'Luca Ferraro',sid:12},
    data:{kind:'prise',ticket:'#412'} },
  { cat:'reports', sev:'alerte', msg:'Kaleb a refusé le report de Mia Costa — aucun élément à l’appui',
    actor:{key:'license:staff2',name:'Kaleb',sid:3,staff:true},
    target:{key:'license:joueur2',name:'Mia Costa',sid:44},
    data:{kind:'refus',ticket:'#413',motifRefus:'aucun élément à l’appui'} },
  { cat:'reports', sev:'alerte', msg:'Report de Sacha Roy sans réponse depuis 40 min',
    actor:{key:'license:joueur3',name:'Sacha Roy',sid:77},
    data:{kind:'sans_reponse',ticket:'#414'} }
];
const dep = await fetch(B+'/api/ingest',{method:'POST',
  headers:{'content-type':'application/json','x-origin-key':KEY},body:JSON.stringify({events:ev})});
t('les quatre moments sont déposés', (await dep.json()).recus === 4);

const flux = await J('/api/events?cat=reports&limit=50');
const L = flux.body.events || [];
t('et se relisent dans la rubrique', L.length === 4, L.length + ' ligne(s)');
const ouv = L.find(e => e.d && e.d.kind === 'ouverture');
t('⚠️ l’OUVERTURE est au nom du joueur, pas du staff',
  ouv && ouv.actor && ouv.actor.name === 'Luca Ferraro', ouv && ouv.actor && ouv.actor.name);
t('et elle porte le motif qu’il a déclaré',
  ouv && ouv.d.motif === 'RDM sur Legion', ouv && ouv.d.motif);
const pris = L.find(e => e.d && e.d.kind === 'prise');
t('⚠️ la PRISE nomme le staff ET le joueur — « qui a pris le ticket de qui »',
  pris && pris.actor.name === 'Nyx' && pris.target && pris.target.name === 'Luca Ferraro',
  pris && pris.actor.name + ' → ' + (pris.target && pris.target.name));
const ref = L.find(e => e.d && e.d.kind === 'refus');
t('le REFUS aussi — « qui a refusé le ticket de qui »',
  ref && ref.actor.name === 'Kaleb' && ref.target && ref.target.name === 'Mia Costa',
  ref && ref.actor.name + ' → ' + (ref.target && ref.target.name));
t('⚠️ un refus est une ALERTE : c’est ce qu’on relit', ref && ref.sev === 'alerte', ref && ref.sev);
t('le ticket que PERSONNE n’a pris se voit aussi',
  L.some(e => e.d && e.d.kind === 'sans_reponse'));

sect('Le ticket se retrouve dans le dossier des deux joueurs');
const dos = await J('/api/players/' + encodeURIComponent('license:joueur1'));
t('le joueur qui a ouvert porte son report',
  (dos.body.last||[]).some(e => e.cat === 'reports'), dos.status === 200 ? 'dossier ouvert' : 'HTTP ' + dos.status);
// ⚠️ DÉFAUT TROUVÉ EN ÉCRIVANT CETTE SUITE : seul l'ACTEUR était
// enregistré comme joueur. Mia n'a jamais rien fait — son ticket a été
// refusé, c'est tout — et son dossier répondait « Joueur inconnu » alors
// qu'il contenait déjà l'évènement. Le dossier compte pourtant les
// évènements où l'on est acteur OU cible : il refusait de s'ouvrir sur
// ce qu'il savait déjà.
const dos2 = await J('/api/players/' + encodeURIComponent('license:joueur2'));
t('⚠️ CELUI DONT LE TICKET A ÉTÉ REFUSÉ a un dossier, bien qu’il n’ait jamais agi',
  dos2.status === 200, 'HTTP ' + dos2.status);
t('et son report y figure', (dos2.body.last||[]).some(e => e.cat === 'reports'));
t('⚠️ mais son compteur d’actions reste à zéro — il n’a rien FAIT',
  dos2.body.player && Number(dos2.body.player.events) === 0,
  dos2.body.player && String(dos2.body.player.events));

sect('La recherche de la rubrique atteint les motifs');
const q = await J('/api/events?cat=reports&q=' + encodeURIComponent('Legion'));
t('on retrouve un report par son motif', (q.body.events||[]).length >= 1,
  (q.body.events||[]).length + ' résultat(s)');
const q2 = await J('/api/events?cat=reports&q=' + encodeURIComponent('Kaleb'));
t('et par le staff qui l’a traité', (q2.body.events||[]).length >= 1);

sect('Les noms employés ailleurs mènent ici');
for (const alias of ['report', 'ticket', 'tickets', 'signalement']) {
  const r = await fetch(B+'/api/ingest',{method:'POST',
    headers:{'content-type':'application/json','x-origin-key':KEY},
    body:JSON.stringify({events:[{cat:alias,sev:'info',msg:'ticket via « '+alias+' »',
      actor:{key:'license:alias',name:'Sonde',sid:9}}]})});
  await r.json();
}
const apres = await J('/api/events?cat=reports&limit=50');
const vias = (apres.body.events||[]).filter(e => /ticket via/.test(e.msg));
t('⚠️ report/ticket/tickets/signalement arrivent dans « Logs des Reports »',
  vias.length === 4, vias.length + '/4');
t('et « staff » reste « Action staff » — ce n’est pas la même chose',
  (await (async()=>{ await fetch(B+'/api/ingest',{method:'POST',
    headers:{'content-type':'application/json','x-origin-key':KEY},
    body:JSON.stringify({events:[{cat:'staff',sev:'info',msg:'action staff de contrôle',
      actor:{key:'license:alias',name:'Sonde',sid:9}}]})}).then(r=>r.json());
    const a = await J('/api/events?cat=admin&limit=50');
    return (a.body.events||[]).some(e => e.msg === 'action staff de contrôle'); })()));

sect('Qui la voit, qui ne la voit pas');
const me = await J('/api/auth/me');
t('le fondateur y a accès', (me.body.cats||[]).includes('reports'));
const rs = await J('/api/roles');
const R = k => (rs.body.roles||[]).find(r => r.key === k);
t('le modérateur la reçoit avec la modération', R('moderateur') && R('moderateur').cats.includes('reports'));
t('⚠️ le HELPER aussi, bien qu’il n’ait pas la modération — c’est lui qui PREND les tickets',
  R('helper') && R('helper').cats.includes('reports'));
t('et il n’a toujours rien d’autre de la modération',
  R('helper') && !R('helper').cats.includes('anticheat') && !R('helper').cats.includes('bans'));
t('⚠️ l’animateur ne la reçoit PAS — il n’a rien à faire dans les tickets',
  R('animateur') && !R('animateur').cats.includes('reports'), R('animateur') && R('animateur').cats.join(','));
t('la brigade anticheat non plus : sa sélection était un TRI, pas un « tout »',
  R('anticheat') && !R('anticheat').cats.includes('reports'));

sect('Rattrapage d’un espace DÉJÀ LIVRÉ');
// ⚠️ Tout ce qui précède tourne sur une base neuve, où les rôles sont semés
// AVEC la rubrique : le rattrapage n'y a rien à faire. Or c'est précisément
// chez les serveurs déjà livrés qu'il décide si la rubrique existe pour
// quelqu'un. On reconstitue donc une base d'AVANT : les mêmes rôles, sans
// « reports », comme ils ont été figés au jour du semis.
const { mkdtempSync, rmSync } = await import('node:fs');
const os = await import('node:os');
const DB = (await import('../db.js')).default || await import('../db.js');
const ROLESVC = (await import('../roles.js')).default || await import('../roles.js');
const CATL = (await import('../catalogue.js')).default || await import('../catalogue.js');

const tmp = mkdtempSync(path.join(os.tmpdir(), 'origin-backfill-'));
const base = DB.open(path.join(tmp, 'avant.db'));
base.prepare(`INSERT INTO spaces(id,name,server_key,state,created_at,created_by)
              VALUES(1,'Client livré avant','cle-avant','actif',?,'test')`).run(Date.now());
ROLESVC.seed(base, 1);
// On retire la rubrique partout : c'est l'état exact d'une base d'hier.
for (const r of base.prepare('SELECT space_id,key,cats FROM roles').all()) {
  const sans = JSON.parse(r.cats).filter(c => c !== 'reports');
  base.prepare('UPDATE roles SET cats=? WHERE space_id=? AND key=?').run(JSON.stringify(sans), r.space_id, r.key);
}
// Un fondateur qui a RETOUCHÉ son rôle de modérateur : sa décision ne doit
// pas être complétée dans son dos.
base.prepare(`UPDATE roles SET cats=? WHERE space_id=1 AND key='moderateur'`)
    .run(JSON.stringify(['bans', 'sanctions']));
ROLESVC.invalidate();

const avant = k => (ROLESVC.byKey(base, 1, k) || {}).cats || [];
t('avant rattrapage, personne ne l’a', !avant('fondateur').includes('reports'));

let marque = 0;
const res = ROLESVC.backfillCat(base, 'reports', false, () => marque++);
ROLESVC.invalidate();
const apres2 = k => (ROLESVC.byKey(base, 1, k) || {}).cats || [];
t('le rattrapage a tourné et posé son repère', res.fait === true && marque === 1,
  res.touches + ' rôle(s) touchés');
t('⚠️ le FONDATEUR la reçoit — sinon la rubrique n’existerait pour personne',
  apres2('fondateur').includes('reports'));
t('l’administrateur et le développeur aussi — ils disaient « tout »',
  apres2('administrateur').includes('reports') && apres2('developpeur').includes('reports'));
t('le helper la reçoit — le catalogue la lui donne, et son rôle est intact',
  apres2('helper').includes('reports'));
t('⚠️ le MODÉRATEUR RETOUCHÉ n’est PAS élargi — sa liste est une décision',
  !apres2('moderateur').includes('reports'), apres2('moderateur').join(','));
t('⚠️ la brigade anticheat non plus : une installation neuve la lui refuse',
  !apres2('anticheat').includes('reports'));
t('l’animateur non plus', !apres2('animateur').includes('reports'));
t('⚠️ l’ordre du catalogue est respecté — le rail ne saute pas',
  JSON.stringify(apres2('fondateur')) === JSON.stringify(
    CATL.CATS.map(c => c.id).filter(c => apres2('fondateur').includes(c))));

// Rejoué, il ne doit RIEN refaire : c'est l'appelant qui garde le repère,
// mais la fonction elle-même doit être sans effet sur ce qui a déjà la
// rubrique — sinon un fondateur qui la retire la verrait revenir.
base.prepare(`UPDATE roles SET cats=? WHERE space_id=1 AND key='helper'`)
    .run(JSON.stringify(apres2('helper').filter(c => c !== 'reports')));
ROLESVC.invalidate();
ROLESVC.backfillCat(base, 'reports', true, () => marque++);
ROLESVC.invalidate();
t('⚠️ une fois le repère posé, retirer la rubrique la garde retirée',
  !((ROLESVC.byKey(base, 1, 'helper') || {}).cats || []).includes('reports') && marque === 1);
base.close(); rmSync(tmp, { recursive: true, force: true });

const n=T.filter(([o])=>o).length;
console.log(`\n  ${n}/${T.length} contrôles passés`);
process.exit(n===T.length?0:1);
