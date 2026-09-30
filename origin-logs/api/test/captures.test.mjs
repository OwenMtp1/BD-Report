// Lancé par « npm test » (test/run.js), qui pose une base neuve et
// démarre l'API dessus : ce fichier ne suppose que l'adresse reçue.
const B = process.env.BASE, KEY = process.env.KEY;
const T=[];const t=(n,ok,x='')=>{T.push([ok,n]);console.log((ok?'  ok    ':'  ÉCHEC ')+n+(x?'  → '+x:''));};
const sect=n=>console.log('\n── '+n+' '+'─'.repeat(Math.max(0,54-n.length)));
let ck='';
const J=async(p,o={},c)=>{const r=await fetch(B+p,{redirect:'manual',...o,headers:{'content-type':'application/json',cookie:c!==undefined?c:ck,...(o.headers||{})}});
  return {status:r.status, body:await r.json().catch(()=>null), r};};
const login=async(pseudo,mdp)=>{const r=await fetch(B+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({pseudo,password:mdp})}); return {ck:(r.headers.get('set-cookie')||'').split(';')[0], body:await r.json()};};

// Un JPEG minuscule mais VRAI : l'API reconnaît le format dans les
// premiers octets, un faux tampon serait refusé — et c'est voulu.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a'+
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA'+
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');

sect('Export : réservé au Fondateur');
const fond = await login('Nyx', 'motdepassetest123'); ck = fond.ck;
// Ce compte administre aussi la plateforme : il arrive donc sans espace,
// et tout ce qui suit se passe DANS un espace.
await J('/api/platform/enter',{method:'POST',body:JSON.stringify({spaceId:1})});
const moi = await J('/api/auth/me');
fond.body.perms = moi.body.perms;
t('le fondateur a le droit d’export', fond.body.perms.includes('logs.export'));
const expF = await fetch(B+'/api/export?from=0&to='+Date.now(), {headers:{cookie:ck}});
t('et l’export répond', expF.status===200, 'HTTP '+expF.status);

await J('/api/staff',{method:'POST',body:JSON.stringify({pseudo:'Kaleb',password:'motdepassetest456',role:'moderateur'})});
await J('/api/staff',{method:'POST',body:JSON.stringify({pseudo:'Adm',password:'motdepasseadmin99',role:'administrateur'})});
const modo = await login('Kaleb','motdepassetest456');
t('le modérateur est bien connecté', !!modo.body.perms, modo.body.error||modo.body.staff?.pseudo);
t('le modérateur ne l’a pas', !modo.body.perms.includes('logs.export'));
const expM = await fetch(B+'/api/export?from=0&to='+Date.now(), {headers:{cookie:modo.ck}});
t('et l’export lui est refusé', expM.status===403, 'HTTP '+expM.status);
const adm = await login('Adm','motdepasseadmin99');
t('l’administrateur non plus', !adm.body.perms.includes('logs.export'));
const expA = await fetch(B+'/api/export?from=0&to='+Date.now(), {headers:{cookie:adm.ck}});
t('refusé aussi à l’administrateur', expA.status===403, 'HTTP '+expA.status);

sect('Capture d’écran : demande, dépôt, lecture');
ck = fond.ck;
// Un joueur connu, pour que la demande porte sur quelqu'un.
await fetch(B+'/api/ingest',{method:'POST',headers:{'content-type':'application/json','x-origin-key':KEY},
  body:JSON.stringify({events:[{cat:'connexions',sev:'info',actor:{key:'license:zzz',name:'Cible Test',sid:7},msg:'Cible Test a rejoint le serveur'}]})});

const sansMotif = await J('/api/actions',{method:'POST',body:JSON.stringify({type:'screenshot',key:'license:zzz',name:'Cible Test',reason:''})});
t('un motif reste obligatoire', sansMotif.status>=400, sansMotif.body?.error);
const dem = await J('/api/actions',{method:'POST',body:JSON.stringify({type:'screenshot',key:'license:zzz',name:'Cible Test',reason:'Soupçon de menu de triche'})});
t('demande enregistrée', dem.body.ok===true, dem.body.error||('action #'+dem.body.id));

const demModo = await J('/api/actions',{method:'POST',body:JSON.stringify({type:'screenshot',key:'license:zzz',name:'Cible Test',reason:'curiosité'})},modo.ck);
t('un modérateur ne peut pas en demander', demModo.status===403, demModo.body?.error);

const enAttente = await (await fetch(B+'/api/actions/pending',{headers:{'x-origin-key':KEY}})).json();
const tache = enAttente.actions.find(a=>a.type==='screenshot');
t('la tâche part vers le serveur de jeu', !!tache, tache? 'type '+tache.type : 'aucune');

const depot = await fetch(B+'/api/screens',{method:'POST',
  headers:{'content-type':'application/octet-stream','x-origin-key':KEY,'x-screen-encoding':'base64',
           'x-screen-action':String(tache.id),'x-screen-width':'1920','x-screen-height':'1080'},
  body: JPEG.toString('base64')});
const depotBody = await depot.json();
t('la capture est acceptée', depot.status===200 && depotBody.id>0, 'capture #'+depotBody.id);

const pasUneImage = await fetch(B+'/api/screens',{method:'POST',
  headers:{'content-type':'application/octet-stream','x-origin-key':KEY},body:'ceci n\'est pas une image'});
t('un corps qui n’est pas une image est refusé', pasUneImage.status===415, 'HTTP '+pasUneImage.status);

const apres = await (await fetch(B+'/api/actions?limit=20',{headers:{cookie:ck}})).json();
const faite = (apres.actions||[]).find(a=>a.id===tache.id);
t('la demande passe à « faite »', faite && faite.status==='done', faite? faite.status+' · '+faite.result : 'introuvable');

const liste = await J('/api/screens');
t('la capture est listée', liste.body.captures.length===1 && liste.body.captures[0].joueur==='Cible Test',
  liste.body.captures.map(c=>c.joueur).join(', '));
t('elle porte son demandeur et son motif',
  liste.body.captures[0].par==='Nyx' && /triche/.test(liste.body.captures[0].motif||''),
  liste.body.captures[0].par+' — '+liste.body.captures[0].motif);

const img = await fetch(B+'/api/screens/'+depotBody.id,{headers:{cookie:ck}});
const bin = Buffer.from(await img.arrayBuffer());
t('l’image se relit telle quelle', img.status===200 && bin.equals(JPEG) && img.headers.get('content-type')==='image/jpeg',
  bin.length+' octets, '+img.headers.get('content-type'));

const ev = await J('/api/events?cat=ecran_joueur&limit=20');
const evCapture = (ev.body.events||[]).find(e=>e.d && e.d.capture===depotBody.id);
t('la capture est aussi un évènement du journal', !!evCapture, evCapture? evCapture.msg : 'aucun');

sect('Capture : qui peut la voir');
// Un rôle privé de la rubrique « Écran du joueur » ne doit pas y accéder,
// même en connaissant le numéro : la garde est en SQL, pas dans l'écran.
await J('/api/roles/moderateur',{method:'PATCH',body:JSON.stringify({cats:['bans','sanctions','anticheat']})});
const imgModo = await fetch(B+'/api/screens/'+depotBody.id,{headers:{cookie:modo.ck}});
t('sans la rubrique, l’image est refusée', imgModo.status===403, 'HTTP '+imgModo.status);
const listeModo = await J('/api/screens',{},modo.ck);
t('et la liste aussi', listeModo.status===403, 'HTTP '+listeModo.status);

const journal = await J('/api/audit');
t('chaque consultation est journalisée', (journal.body.audit||[]).some(a=>a.action==='screen.vue'),
  (journal.body.audit||[]).filter(a=>a.action==='screen.vue').length+' consultation(s)');

sect('Revérification automatique des accès');
const acces = await J('/api/platform/acces');
t('l’état du balayage est lisible', acces.status===200 && typeof acces.body.intervalleMin==='number',
  'toutes les '+acces.body?.intervalleMin+' min');
t('il est actif par défaut', acces.body.actif===true);
const lance = await J('/api/platform/acces',{method:'POST'});
t('on peut le lancer à la main', lance.status===200 && lance.body.dernier>0, new Date(lance.body.dernier||0).toISOString());
const accesModo = await J('/api/platform/acces',{},modo.ck);
t('réservé à l’administration de plateforme', accesModo.status===403, 'HTTP '+accesModo.status);

const bad=T.filter(x=>!x[0]);
console.log(`\n  ${T.length-bad.length}/${T.length} contrôles passés`);
if(bad.length) console.log('  à corriger :\n   - '+bad.map(x=>x[1]).join('\n   - '));
process.exit(bad.length?1:0);
