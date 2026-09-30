// Moteur d'alertes — des RÈGLES À SEUIL, évaluées à l'ingestion.
// « Alerte » ne voulait dire qu'« évènement grave pas encore traité ». Ici
// on vérifie ce qui compte vraiment en modération : le franchissement d'un
// SEUIL sur une fenêtre glissante, par joueur ou global, et le fait qu'une
// alerte déclenchée NE SE RE-DÉCLENCHE PAS sur elle-même.
const B = process.env.BASE, KEY = process.env.KEY;
const T=[];const t=(n,ok,x='')=>{T.push([ok,n]);console.log((ok?'  ok    ':'  ÉCHEC ')+n+(x?'  → '+x:''));};
const sect=n=>console.log('\n── '+n+' '+'─'.repeat(Math.max(0,54-n.length)));
let ck='';
const J=async(p,o={},c)=>{const r=await fetch(B+p,{redirect:'manual',...o,headers:{'content-type':'application/json',cookie:c!==undefined?c:ck,...(o.headers||{})}});
  return {status:r.status, body:await r.json().catch(()=>null), r};};
const ing=(evs)=>fetch(B+'/api/ingest',{method:'POST',
  headers:{'content-type':'application/json','x-origin-key':KEY},body:JSON.stringify({events:evs})});
const ac=(key,name,sev='alerte',n=1)=>Array.from({length:n},()=>({cat:'anticheat',sev,
  msg:'Détection suspecte', actor:{key,name}}));
// Combien d'évènements « alerte déclenchée » existent, en option pour un joueur.
async function nbAlertes(pourNom){
  const r = await J('/api/events?limit=500');
  const evs = (r.body.events||[]).filter(e => e.d && e.d.kind === 'alerte_regle');
  return pourNom ? evs.filter(e => e.actor && e.actor.name === pourNom).length : evs.length;
}

const r0 = await fetch(B+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({pseudo:'Nyx',password:'motdepassetest123'})});
ck = (r0.headers.get('set-cookie')||'').split(';')[0];
t('le fondateur se connecte', r0.status===200, 'HTTP '+r0.status);

sect('Le catalogue de règles se lit et s’écrit');
const vide = await J('/api/alerts/rules');
t('au départ, aucune règle', vide.status===200 && Array.isArray(vide.body.rules) && vide.body.rules.length===0);
t('mais les catalogues (catégories, gravités) sont fournis',
  (vide.body.cats||[]).some(c=>c.id==='anticheat') && (vide.body.sevs||[]).some(s=>s.id==='critique'));

const put = await J('/api/alerts/rules', { method:'PUT', body: JSON.stringify({ rules:[
  { name:'Cheat répété', cat:'anticheat', minSev:'alerte', scope:'player', count:3, windowMin:60 }
]})});
t('une règle s’enregistre et revient normalisée', put.status===200
  && put.body.rules.length===1 && !!put.body.rules[0].id && put.body.rules[0].count===3, JSON.stringify(put.body.rules&&put.body.rules[0]));
t('elle se relit', (await J('/api/alerts/rules')).body.rules.length===1);
// ⚠️ les valeurs aberrantes sont bornées, pas acceptées telles quelles.
const borne = await J('/api/alerts/rules', { method:'PUT', body: JSON.stringify({ rules:[
  { name:'x'.repeat(200), cat:'inconnue', minSev:'pouet', scope:'nimp', count:0, windowMin:99999 }
]})});
const rb = borne.body.rules[0];
t('⚠️ une règle aberrante est bornée (catégorie, gravité, seuil, fenêtre, portée)',
  rb.cat==='any' && rb.minSev==='alerte' && rb.count>=2 && rb.windowMin<=1440 && rb.scope==='player' && rb.name.length<=60,
  JSON.stringify(rb));
// on remet la vraie règle
await J('/api/alerts/rules', { method:'PUT', body: JSON.stringify({ rules:[
  { name:'Cheat répété', cat:'anticheat', minSev:'alerte', scope:'player', count:3, windowMin:60 }
]})});

sect('Un seuil franchi déclenche — pas avant');
await ing(ac('license:cheater1','Le Tricheur',  'alerte', 2));
t('deux détections : rien ne sonne encore', (await nbAlertes('Le Tricheur'))===0);
await ing(ac('license:cheater1','Le Tricheur',  'alerte', 1));   // la 3e
t('la troisième fait sonner', (await nbAlertes('Le Tricheur'))===1);
// L'alerte est bien un évènement critique, dans la catégorie de la règle.
const feed = await J('/api/events?cat=anticheat&limit=50');
const al = (feed.body.events||[]).find(e=>e.d&&e.d.kind==='alerte_regle'&&e.actor&&e.actor.name==='Le Tricheur');
t('l’alerte est critique, catégorie anticheat, et compte le bon total',
  !!al && al.sev==='critique' && al.cat==='anticheat' && al.d.count>=3, al?JSON.stringify({sev:al.sev,cat:al.cat,c:al.d.count}):'absente');

sect('Anti-rabâchage et cloisonnement par sujet');
await ing(ac('license:cheater1','Le Tricheur',  'alerte', 2));   // encore, dans la fenêtre
t('⚠️ elle ne re-sonne pas pour le même joueur dans sa fenêtre', (await nbAlertes('Le Tricheur'))===1);
await ing(ac('license:cheater2','L’Autre',       'alerte', 3));
t('un AUTRE joueur au même seuil sonne de son côté', (await nbAlertes('L’Autre'))===1);
t('les gravités trop basses ne comptent pas', await (async()=>{
  await ing(ac('license:cheater3','Le Calme','notice',5));   // 5 mais en « notice » < alerte
  return (await nbAlertes('Le Calme'))===0; })());

sect('⚠️ Une alerte ne se déclenche JAMAIS sur elle-même');
// Deux alertes critiques anticheat existent déjà (Le Tricheur, L’Autre).
await J('/api/alerts/rules', { method:'PUT', body: JSON.stringify({ rules:[
  { name:'Cheat répété',       cat:'anticheat', minSev:'alerte',   scope:'player', count:3, windowMin:60 },
  { name:'Vague de critiques', cat:'anticheat', minSev:'critique', scope:'global', count:2, windowMin:60 }
]})});
const avant = await nbAlertes();
await ing([{cat:'anticheat',sev:'critique',msg:'Une vraie détection critique',actor:{key:'license:cheater4',name:'Le Gros'}}]);
// La fenêtre contient 1 vraie critique + les alertes déjà déclenchées. Si
// celles-ci comptaient, « Vague de critiques » (seuil 2, global) sonnerait.
t('les alertes déjà émises ne re-nourrissent pas une règle (seuil 2 non atteint par 1 vraie critique)',
  (await nbAlertes()) === avant, 'avant '+avant+' après '+(await nbAlertes()));

sect('Portée serveur (global)');
await J('/api/alerts/rules', { method:'PUT', body: JSON.stringify({ rules:[
  { name:'Serveur agité', cat:'any', minSev:'info', scope:'global', count:5, windowMin:1440 }
]})});
const avG = await nbAlertes();
await ing([{cat:'connexions',sev:'info',msg:'un dernier évènement',actor:{key:'license:x',name:'Quelqu’un'}}]);
const al2 = (await J('/api/events?limit=500')).body.events.find(e=>e.d&&e.d.kind==='alerte_regle'&&e.d.scope==='global');
t('un seuil GLOBAL franchi dépose une alerte « sur le serveur » (catégorie admin)',
  (await nbAlertes())>avG && !!al2 && al2.cat==='admin', al2?JSON.stringify({cat:al2.cat,scope:al2.d.scope}):'absente');

const bad=T.filter(x=>!x[0]);
console.log(`\n  ${T.length-bad.length}/${T.length} contrôles passés`);
if(bad.length) console.log('  à corriger :\n   - '+bad.map(x=>x[1]).join('\n   - '));
process.exit(bad.length?1:0);
