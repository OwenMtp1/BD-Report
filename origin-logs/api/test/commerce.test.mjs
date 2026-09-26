// Lancé par « npm test » (test/run.js), qui pose une base neuve et
// démarre l'API dessus : ce fichier ne suppose que l'adresse reçue.
const B = process.env.BASE, KEY = process.env.KEY;
const T=[];const t=(n,ok,x='')=>{T.push([ok,n]);console.log((ok?'  ok    ':'  ÉCHEC ')+n+(x?'  → '+x:''));};
const sect=n=>console.log('\n── '+n+' '+'─'.repeat(Math.max(0,54-n.length)));
let ck='';
const J=async(p,o={},c)=>{const r=await fetch(B+p,{redirect:'manual',...o,headers:{'content-type':'application/json',cookie:c!==undefined?c:ck,...(o.headers||{})}});
  return {status:r.status, body:await r.json().catch(()=>null), r};};
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a'+
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA'+
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==','base64');

const r0 = await fetch(B+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({pseudo:'Sup',password:'motdepassesup12345'})});
ck = (r0.headers.get('set-cookie')||'').split(';')[0];
await J('/api/platform/enter',{method:'POST',body:JSON.stringify({spaceId:1})});

sect('Les formules existent et se composent');
const pl = await J('/api/platform/plans');
t('trois formules de départ', pl.body.plans.length===3, pl.body.plans.map(x=>x.label).join(', '));
const starter = pl.body.plans.find(x=>x.key==='starter');
t('Starter borne les comptes et la rétention', starter.maxStaff===5 && starter.maxRetention===7);
t('et n’inclut pas les captures', starter.screens===false);
const illimite = pl.body.plans.find(x=>x.key==='illimite');
t('⚠️ « sans limite » n’est pas « zéro »', illimite.maxStaff===null && illimite.maxRetention===null,
  'maxStaff='+illimite.maxStaff);
const neuve = await J('/api/platform/plans',{method:'POST',body:JSON.stringify(
  {label:'Découverte',prix:'0 €',maxStaff:2,maxRetention:3,screens:false,rang:5})});
t('on crée une formule', neuve.body.ok===true, neuve.body.key);
const maj = await J('/api/platform/plans/'+neuve.body.key,{method:'PATCH',body:JSON.stringify({maxStaff:3})});
t('on la modifie', maj.body.ok===true);
const sup = await J('/api/platform/plans/'+neuve.body.key,{method:'DELETE'});
t('et on la supprime tant qu’elle est libre', sup.status===200);

sect('Un espace client, borné par sa formule');
const sp = await J('/api/platform/spaces',{method:'POST',body:JSON.stringify(
  {nom:'Client Starter',guildId:'555000333',staffRoleId:'900003',formule:'starter'})});
const ID = sp.body.id, CLE = sp.body.cle;
t('espace créé avec sa formule', sp.body.ok===true, 'espace #'+ID);
const liste = await J('/api/platform/spaces');
const carte = liste.body.spaces.find(x=>x.id===ID);
t('la carte porte la formule', carte.formule==='starter' && carte.formuleLabel==='Starter', carte.formuleLabel);

await J('/api/platform/enter',{method:'POST',body:JSON.stringify({spaceId:ID})});
let dernier = null;
for (let i = 0; i < 6; i++)
  dernier = await J('/api/staff',{method:'POST',body:JSON.stringify(
    {pseudo:'Membre'+i,password:'motdepassemembre'+i,role:'moderateur'})});
t('le plafond de comptes s’applique', dernier.status===402, dernier.body?.error);
t('et le message NOMME la formule et le plafond',
  /Starter/.test(dernier.body?.error||'') && /5 comptes/.test(dernier.body?.error||''));

const capt = await fetch(B+'/api/screens',{method:'POST',
  headers:{'content-type':'application/octet-stream','x-origin-key':CLE,'x-screen-encoding':'base64',
           'x-screen-name':'Joueur','x-screen-key':'license:aa'},body: JPEG.toString('base64')});
t('Starter n’a pas les captures', capt.status===402, 'HTTP '+capt.status);

await J('/api/platform/enter',{method:'POST',body:JSON.stringify({spaceId:1})});
await J('/api/platform/spaces/'+ID,{method:'PATCH',body:JSON.stringify({formule:'pro'})});
const capt2 = await fetch(B+'/api/screens',{method:'POST',
  headers:{'content-type':'application/octet-stream','x-origin-key':CLE,'x-screen-encoding':'base64',
           'x-screen-name':'Joueur','x-screen-key':'license:aa'},body: JPEG.toString('base64')});
t('passer en Pro les autorise', capt2.status===200, 'HTTP '+capt2.status);

sect('L’échéance ferme l’espace toute seule');
const hier = new Date(Date.now() - 86400000).toISOString().slice(0,10);
await J('/api/platform/spaces/'+ID,{method:'PATCH',body:JSON.stringify({echeance:hier})});
const apres = await J('/api/platform/spaces');
const fermee = apres.body.spaces.find(x=>x.id===ID);
t('une échéance passée ferme l’espace sur-le-champ', fermee.etat==='ferme', fermee.etat);
const ingFerme = await fetch(B+'/api/ingest',{method:'POST',
  headers:{'content-type':'application/json','x-origin-key':CLE},body:JSON.stringify({events:[{cat:'connexions',sev:'info',msg:'x'}]})});
t('et le serveur de jeu cesse d’être accepté', ingFerme.status===401, 'HTTP '+ingFerme.status);
const demain = new Date(Date.now() + 30*86400000).toISOString().slice(0,10);
await J('/api/platform/spaces/'+ID,{method:'PATCH',body:JSON.stringify({echeance:demain,etat:'actif'})});
const rouvert = (await J('/api/platform/spaces')).body.spaces.find(x=>x.id===ID);
t('repousser la date et rouvrir rend l’accès', rouvert.etat==='actif', rouvert.etat);
t('l’échéance est annoncée', rouvert.echeance > Date.now(), new Date(rouvert.echeance||0).toISOString().slice(0,10));

const ptIllimite = (await J('/api/platform/plans')).body.plans.find(x=>x.key==='illimite');
t('une formule utilisée ne se supprime pas',
  (await J('/api/platform/plans/pro',{method:'DELETE'})).status===409);

sect('Données personnelles d’un joueur');
await fetch(B+'/api/ingest',{method:'POST',headers:{'content-type':'application/json','x-origin-key':KEY},
  body:JSON.stringify({events:[
    {cat:'connexions',sev:'info',actor:{key:'license:rgpd1',name:'Marc Dupont',sid:9},msg:'Marc Dupont a rejoint le serveur'},
    {cat:'inventaire',sev:'info',actor:{key:'license:rgpd1',name:'Marc Dupont'},msg:'Marc Dupont a donné 2× pain'}]})});
const exp = await fetch(B+'/api/rgpd/'+encodeURIComponent('license:rgpd1'),{headers:{cookie:ck}});
const dossier = await exp.json();
t('on exporte ce qu’on a sur lui', exp.status===200 && dossier.evenements.length===2,
  dossier.evenements?.length+' évènement(s)');
t('le fichier est remettable (téléchargement)', /attachment/.test(exp.headers.get('content-disposition')||''),
  exp.headers.get('content-disposition'));
t('il dit qui l’a extrait et quand', dossier.extraitPar==='Sup' && dossier.extraitLe>0);

// Un bannissement en cours ne doit pas s'effacer par ce chemin.
await J('/api/actions',{method:'POST',body:JSON.stringify(
  {type:'ban',key:'license:rgpd1',name:'Marc Dupont',reason:'Cheat détecté',days:0})});
const refus = await J('/api/rgpd/'+encodeURIComponent('license:rgpd1'),{method:'DELETE',body:'{}'});
t('⚠️ un bannissement en cours bloque l’effacement muet', refus.status===409, refus.body?.error?.slice(0,60));
const eff = await J('/api/rgpd/'+encodeURIComponent('license:rgpd1'),
  {method:'DELETE',body:JSON.stringify({confirmeBanActif:true})});
t('confirmé, l’effacement se fait', eff.body.ok===true, eff.body.evenements+' évènement(s) effacés');

const reste = await J('/api/events?q=Marc%20Dupont&limit=20');
t('ses évènements ont disparu', !(reste.body.events||[]).some(e=>/Marc Dupont/.test(e.msg)),
  (reste.body.events||[]).length+' ligne(s) restantes');
const reg = await J('/api/bans?state=tous');
const ban = (reg.body.bans||[]).find(x=>/^effacé-/.test(x.name||''));
t('⚠️ mais le bannissement reste, sans son nom', !!ban, ban ? ban.name : 'introuvable');
const journal = await J('/api/audit');
t('l’effacement lui-même laisse une trace', (journal.body.audit||[]).some(a=>a.action==='rgpd.effacement'));

sect('Réservé à qui en a le droit');
await J('/api/staff',{method:'POST',body:JSON.stringify({pseudo:'Modo',password:'motdepassemodo123',role:'moderateur'})});
const rm = await fetch(B+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({pseudo:'Modo',password:'motdepassemodo123'})});
const ckm = (rm.headers.get('set-cookie')||'').split(';')[0];
t('un modérateur n’exporte pas', (await J('/api/rgpd/'+encodeURIComponent('license:zz'),{},ckm)).status===403);
t('ni n’efface', (await J('/api/rgpd/'+encodeURIComponent('license:zz'),{method:'DELETE',body:'{}'},ckm)).status===403);
t('ni ne voit les formules', (await J('/api/platform/plans',{},ckm)).status===403);

sect('Conservation illimitée — « ne jamais effacer »');
// ⚠️ La décision se prend à un seul endroit (conservation.js) : on la
// vérifie ici sur la table de vérité, et sur l'API juste après. Un test
// qui ne regarderait que l'API ne dirait pas POURQUOI un espace purge.
const CONSERV = await import('../conservation.js');
const sansPlafond = { maxRetention: null }, plafond7 = { maxRetention: 7 };
const cas = [
  ['sans case cochée, la rétention de l’espace s’applique',
    CONSERV.pour({ retention: 30 }, sansPlafond, 30).jours === 30],
  ['case cochée sans plafond : on n’efface jamais',
    CONSERV.pour({ retention: 30, keep_forever: 1 }, sansPlafond, 30).jours === null],
  ['⚠️ et « jamais » se dit `null`, pas un très grand nombre',
    CONSERV.pour({ keep_forever: 1 }, sansPlafond, 30).illimite === true],
  ['⚠️ une case cochée ne s’achète pas : la formule plafonne quand même',
    CONSERV.pour({ retention: 3650, keep_forever: 1 }, plafond7, 30).jours === 7],
  ['et l’écart se signale au lieu de se taire',
    CONSERV.pour({ retention: 3650, keep_forever: 1 }, plafond7, 30).bride === true],
  ['le plafond descend, la demande ne monte pas',
    CONSERV.pour({ retention: 3 }, plafond7, 30).jours === 3],
  ['sans rétention propre, celle du serveur sert de défaut',
    CONSERV.pour({}, sansPlafond, 45).jours === 45]
];
for (const [nom, vrai] of cas) t(nom, vrai);

const spInf = await J('/api/platform/spaces',{method:'POST',body:JSON.stringify(
  {nom:'Client Archive',guildId:'555000999',staffRoleId:'900009',retention:30,conservationIllimitee:true})});
const IDI = spInf.body.id;
const carteI = (await J('/api/platform/spaces')).body.spaces.find(x=>x.id===IDI);
t('on crée un espace « jamais effacé »', carteI.conservationIllimitee===true);
t('et rien ne s’y purge', carteI.conservationEffective===null, String(carteI.conservationEffective));
t('la rétention saisie reste mémorisée dessous', carteI.retention===30, String(carteI.retention));

await J('/api/platform/spaces/'+IDI,{method:'PATCH',body:JSON.stringify({formule:'starter'})});
const bride = (await J('/api/platform/spaces')).body.spaces.find(x=>x.id===IDI);
t('⚠️ passer en Starter reprend la conservation illimitée',
  bride.conservationEffective===7 && bride.conservationBridee===true,
  'effective='+bride.conservationEffective);
t('mais la demande du client reste visible', bride.conservationIllimitee===true);

await J('/api/platform/spaces/'+IDI,{method:'PATCH',body:JSON.stringify({formule:'illimite'})});
const rendu = (await J('/api/platform/spaces')).body.spaces.find(x=>x.id===IDI);
t('et repasser en Illimité la rétablit sans re-cocher',
  rendu.conservationEffective===null && rendu.conservationBridee===false);

await J('/api/platform/spaces/'+IDI,{method:'PATCH',body:JSON.stringify({conservationIllimitee:false})});
const eteint = (await J('/api/platform/spaces')).body.spaces.find(x=>x.id===IDI);
t('on décoche et la durée revient', eteint.conservationIllimitee===false && eteint.conservationEffective===30,
  String(eteint.conservationEffective));
const jrn = await J('/api/platform/journal?action=plateforme.conservation');
t('⚠️ les deux décisions sont tracées — décocher DÉTRUIT au prochain balayage',
  (jrn.body.entrees||[]).length >= 2, ((jrn.body.entrees||[]).length)+' entrées');
t('et le journal dit laquelle', (jrn.body.entrees||[]).some(e=>/jamais effacés/.test(e.detail||''))
  && (jrn.body.entrees||[]).some(e=>/rétention de/.test(e.detail||'')),
  (jrn.body.entrees||[]).map(e=>e.detail).join(' | '));

sect('Une offre vend des RUBRIQUES, pas seulement des jours');
// ⚠️ C'est ce qui manquait pour qu'il y ait quelque chose à vendre : sans
// découpage par offre, tous les clients voyaient les dix-huit rubriques et
// deux formules ne se distinguaient que par un nombre de jours.
await J('/api/platform/enter',{method:'POST',body:JSON.stringify({spaceId:1})});
const plans2 = (await J('/api/platform/plans')).body.plans;
const st2 = plans2.find(x=>x.key==='starter'), il2 = plans2.find(x=>x.key==='illimite');
t('Starter n’ouvre qu’une partie des rubriques',
  Array.isArray(st2.cats) && st2.cats.length > 0 && st2.cats.includes('bans') && !st2.cats.includes('casino'),
  (st2.cats||[]).length + ' rubrique(s)');
t('⚠️ « toutes les rubriques » se dit NULL, pas une liste figée',
  il2.cats === null, String(il2.cats));

const spR = await J('/api/platform/spaces',{method:'POST',body:JSON.stringify(
  {nom:'Client Rubriques',guildId:'555000444',staffRoleId:'900044',formule:'starter'})});
const IDR = spR.body.id;
await J('/api/platform/enter',{method:'POST',body:JSON.stringify({spaceId:IDR})});
await J('/api/staff',{method:'POST',body:JSON.stringify(
  {pseudo:'PatronRub',password:'motdepassepatron123',role:'fondateur'})});
const rp = await fetch(B+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({pseudo:'PatronRub',password:'motdepassepatron123'})});
const ckR = (rp.headers.get('set-cookie')||'').split(';')[0];
const moi1 = await J('/api/auth/me',{},ckR);
t('⚠️ même le FONDATEUR du client est borné par l’offre — sinon il lui suffisait de cocher',
  !moi1.body.cats.includes('casino') && moi1.body.cats.includes('bans'),
  moi1.body.cats.length+' rubrique(s)');
t('et il ne voit que ce que Starter vend',
  moi1.body.cats.every(c => st2.cats.includes(c)), moi1.body.cats.join(','));
const casino = await J('/api/events?cat=casino',{},ckR);
t('une rubrique non vendue ne rend AUCUN évènement',
  casino.status===200 && (casino.body.events||[]).length===0, 'HTTP '+casino.status);

await J('/api/platform/spaces/'+IDR,{method:'PATCH',body:JSON.stringify({formule:'illimite'})});
const moi2 = await J('/api/auth/me',{},ckR);
t('⚠️ monter d’offre ouvre les rubriques SANS se reconnecter',
  moi2.body.cats.includes('casino'), moi2.body.cats.length+' rubrique(s)');

// On modifie l'offre elle-même : c'est le geste de l'onglet « Offres ».
await J('/api/platform/plans/illimite',{method:'PATCH',body:JSON.stringify(
  {cats:['bans','sanctions'],label:'Illimité',prix:'29 €/mois'})});
const moi3 = await J('/api/auth/me',{},ckR);
t('retirer une rubrique de l’OFFRE la retire chez ses clients',
  !moi3.body.cats.includes('casino') && moi3.body.cats.includes('bans'),
  moi3.body.cats.join(','));
await J('/api/platform/plans/illimite',{method:'PATCH',body:JSON.stringify({cats:null})});
const moi4 = await J('/api/auth/me',{},ckR);
t('et « toutes » les rend toutes', moi4.body.cats.includes('casino'), moi4.body.cats.length+' rubrique(s)');

t('⚠️ on ne supprime pas une offre que des clients portent',
  (await J('/api/platform/plans/illimite',{method:'DELETE'})).status===409);

sect('La durée de conservation se règle sur CHAQUE environnement');
// ⚠️ Elle ne se posait qu'à la création : un client qui renégocie six
// semaines plus tard obligeait à passer par la console.
await J('/api/platform/spaces/'+IDR,{method:'PATCH',body:JSON.stringify({retention:120})});
const carteR = (await J('/api/platform/spaces')).body.spaces.find(x=>x.id===IDR);
t('la durée saisie est retenue', carteR.retention===120, String(carteR.retention));
t('et elle s’applique, l’offre Illimité ne plafonnant pas',
  carteR.conservationEffective===120, String(carteR.conservationEffective));
t('la carte dit le plafond de l’offre — c’est lui qui explique un écart',
  carteR.plafondConservation===null, String(carteR.plafondConservation));
await J('/api/platform/spaces/'+IDR,{method:'PATCH',body:JSON.stringify({formule:'starter'})});
const carteR2 = (await J('/api/platform/spaces')).body.spaces.find(x=>x.id===IDR);
t('⚠️ sous une offre plafonnée, c’est le PLAFOND qui s’applique',
  carteR2.conservationEffective===7 && carteR2.plafondConservation===7,
  'effective='+carteR2.conservationEffective);
t('mais la durée demandée reste écrite', carteR2.retention===120, String(carteR2.retention));
const bornes = await J('/api/platform/spaces/'+IDR,{method:'PATCH',body:JSON.stringify({retention:99999})});
const carteR3 = (await J('/api/platform/spaces')).body.spaces.find(x=>x.id===IDR);
t('une durée aberrante est ramenée dans les bornes',
  bornes.status===200 && carteR3.retention===3650, String(carteR3.retention));

const bad=T.filter(x=>!x[0]);
console.log(`\n  ${T.length-bad.length}/${T.length} contrôles passés`);
if(bad.length) console.log('  à corriger :\n   - '+bad.map(x=>x[1]).join('\n   - '));
process.exit(bad.length?1:0);
