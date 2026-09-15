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

const bad=T.filter(x=>!x[0]);
console.log(`\n  ${T.length-bad.length}/${T.length} contrôles passés`);
if(bad.length) console.log('  à corriger :\n   - '+bad.map(x=>x[1]).join('\n   - '));
process.exit(bad.length?1:0);
