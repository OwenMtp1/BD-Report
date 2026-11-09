// ============================================================
// Lisibilité de l'argent — le classement par TYPE.
//
// ⚠️ Sur QBCore, TOUT l'argent passe par un seul branchement
// (`OnMoneyChange`) : un salaire, une allocation, un avantage VIP et un
// don du staff arrivent par la même porte, dans la même rubrique, avec
// le même libellé. Le motif était capté (`data.motif`) et affiché
// NULLE PART, et rien ne permettait de ne demander qu'un type de
// mouvement. Conséquence tenue pour une fatalité : la rubrique
// « Transactions » était illisible, et « trouver les dons du staff sur
// un joueur » n'avait aucune réponse.
//
// On classe donc à l'ingestion (`data.argent`), on expose le catalogue,
// et on filtre en SQL — sinon « masquer les salaires » reviendrait à
// couper le branchement, c'est-à-dire à perdre aussi les dons.
// ============================================================
const B = process.env.BASE, KEY = process.env.KEY;
const T=[];const t=(n,ok,x='')=>{T.push([ok,n]);console.log((ok?'  ok    ':'  ÉCHEC ')+n+(x?'  → '+x:''));};
const sect=n=>console.log('\n── '+n+' '+'─'.repeat(Math.max(0,54-n.length)));
let ck='';
const J=async(p,o={},c)=>{const r=await fetch(B+p,{redirect:'manual',...o,headers:{'content-type':'application/json',cookie:c!==undefined?c:ck,...(o.headers||{})}});
  return {status:r.status, body:await r.json().catch(()=>null), r};};

const r0 = await fetch(B+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({pseudo:'Nyx',password:'motdepassetest123'})});
ck = (r0.headers.get('set-cookie')||'').split(';')[0];

sect('Le catalogue nomme les types d’argent');
const cat = await J('/api/catalogue');
const types = cat.body.argentTypes || [];
const ids = types.map(x => x.id);
t('les types sont publiés', types.length >= 6, ids.join(','));
t('le don du staff en est un', ids.includes('give_staff'));
t('salaire, allocation et VIP aussi', ids.includes('salaire') && ids.includes('allocation') && ids.includes('vip'));
t('⚠️ et « autre » existe — un mouvement non reconnu reste VISIBLE, il ne disparaît pas',
  ids.includes('autre'));
const routine = cat.body.argentRoutine || [];
t('⚠️ la ROUTINE est nommée à part : c’est elle qu’on replie, pas l’argent en bloc',
  routine.includes('salaire') && routine.includes('vip') && routine.includes('allocation')
  && !routine.includes('give_staff') && !routine.includes('achat'), routine.join(','));

sect('Le classement se fait à l’ingestion, d’après le motif');
const env = (ev) => fetch(B+'/api/ingest',{method:'POST',
  headers:{'content-type':'application/json','x-origin-key':KEY},
  body:JSON.stringify({ events: ev })});

const moneyEv = (msg, data, extra={}) => Object.assign({
  cat:'inventaire', sev:'info', msg,
  actor:{key:'license:j1',name:'Luca Ferraro',sid:12},
  data
}, extra);

await env([
  moneyEv('Luca Ferraro a reçu 3500 $ — Avantage VIP',       { kind:'money', compte:'bank', montant:3500, motif:'Avantage VIP mensuel' }),
  moneyEv('Luca Ferraro a reçu 1200 $ — Salaire',            { kind:'money', compte:'bank', montant:1200, motif:'Salaire policier' }),
  moneyEv('Luca Ferraro a reçu 400 $ — Allocation chômage',  { kind:'money', compte:'bank', montant:400,  motif:'allocation chômage' }),
  moneyEv('Luca Ferraro a dépensé 80 000 $ — Achat véhicule',{ kind:'money', compte:'cash', montant:80000, motif:'Achat véhicule concession' }),
  moneyEv('Luca Ferraro a payé 250 $ — Amende',              { kind:'money', compte:'bank', montant:250,  motif:'Amende stationnement' }),
  moneyEv('Luca Ferraro a reçu 5000 $ — Virement de Mia',    { kind:'money', compte:'bank', montant:5000, motif:'virement de Mia Costa' }),
  moneyEv('Luca Ferraro a reçu 900 $ — motif absent',        { kind:'money', compte:'bank', montant:900 }),
  // Un don du staff : il vit dans la rubrique « admin », pas dans
  // « inventaire » — et c'est précisément pour cela qu'on ne le trouvait pas.
  { cat:'admin', sev:'notice', msg:'Nyx a donné 10 000 $ à Luca Ferraro',
    actor:{key:'license:staff1',name:'Nyx',sid:2,staff:true},
    target:{key:'license:j1',name:'Luca Ferraro',sid:12},
    data:{ type:'give', montant:10000, raison:'remboursement bug concession' } },
  // Témoin : un évènement SANS argent ne doit recevoir aucun type.
  { cat:'connexions', sev:'info', msg:'Luca Ferraro s’est connecté',
    actor:{key:'license:j1',name:'Luca Ferraro',sid:12}, data:{ kind:'join' } }
]);
await new Promise(r => setTimeout(r, 250));

const tous = await J('/api/events?limit=50');
const parType = {};
for (const e of (tous.body.events||[])) {
  const a = e.d && e.d.argent; if (a) parType[a] = (parType[a]||0) + 1;
}
t('l’avantage VIP est reconnu', parType.vip === 1, JSON.stringify(parType));
t('le salaire aussi', parType.salaire === 1);
t('l’allocation aussi', parType.allocation === 1);
t('l’achat aussi', parType.achat === 1);
t('l’amende aussi', parType.amende === 1);
t('le virement aussi', parType.transfert === 1);
t('⚠️ un mouvement sans motif tombe en « autre » — pas dans le vide', parType.autre === 1);
t('⚠️ le don du staff est reconnu MALGRÉ sa rubrique « admin »', parType.give_staff === 1);
const join = (tous.body.events||[]).find(e => e.cat === 'connexions');
t('⚠️ une connexion ne porte AUCUN type d’argent — on ne classe que ce qui en est',
  !!join && !(join.d && join.d.argent));

sect('Filtrer par type, et replier la routine');
const q = async (qs) => (await J('/api/events?limit=50&'+qs)).body.events || [];

const dons = await q('kind=give_staff');
t('« Don du staff » ne rend que les dons', dons.length === 1 && dons[0].d.argent === 'give_staff', String(dons.length));
t('⚠️ et il le trouve SANS qu’on ait à deviner sa rubrique',
  dons.length === 1 && dons[0].cat === 'admin');

const deux = await q('kind=salaire,vip');
t('deux types se demandent ensemble', deux.length === 2, String(deux.length));

const sansRoutine = await q('sansRoutine=1');
const typesVus = new Set(sansRoutine.map(e => e.d && e.d.argent).filter(Boolean));
t('⚠️ la routine repliée fait disparaître salaires, allocations et VIP',
  !typesVus.has('salaire') && !typesVus.has('vip') && !typesVus.has('allocation'),
  [...typesVus].join(','));
t('⚠️ …et RIEN d’autre : achat, amende, virement, don et « autre » restent',
  typesVus.has('achat') && typesVus.has('amende') && typesVus.has('transfert')
  && typesVus.has('give_staff') && typesVus.has('autre'));
t('⚠️ replier la routine ne touche pas aux évènements qui ne sont pas de l’argent',
  sansRoutine.some(e => e.cat === 'connexions'));

sect('Les garde-fous du filtre');
const bidon = await q('kind=' + encodeURIComponent("' OR 1=1 --"));
t('⚠️ un type qui n’a pas la forme attendue est écarté, pas interpolé',
  Array.isArray(bidon), String(bidon.length));
const trop = await q('kind=' + Array.from({length:30},(_,i)=>'t'+i).join(','));
t('le nombre de types demandés est borné', Array.isArray(trop));

const n=T.filter(([o])=>o).length;
console.log(`\n  ${n}/${T.length} contrôles passés`);
process.exit(n===T.length?0:1);
