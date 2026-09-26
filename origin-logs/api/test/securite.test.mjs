// Lancé par « npm test » (test/run.js), qui pose une base neuve et
// démarre l'API dessus : ce fichier ne suppose que l'adresse reçue.
const B = process.env.BASE, KEY = process.env.KEY;
const T=[];const t=(n,ok,x='')=>{T.push([ok,n]);console.log((ok?'  ok    ':'  ÉCHEC ')+n+(x?'  → '+x:''));};
const sect=n=>console.log('\n── '+n+' '+'─'.repeat(Math.max(0,54-n.length)));
let ck='';
const J=async(p,o={},c)=>{const r=await fetch(B+p,{redirect:'manual',...o,headers:{'content-type':'application/json',cookie:c!==undefined?c:ck,...(o.headers||{})}});
  return {status:r.status, body:await r.json().catch(()=>null), r};};
const ing=(evs,extra={})=>fetch(B+'/api/ingest',{method:'POST',
  headers:{'content-type':'application/json','x-origin-key':KEY,...extra},body:JSON.stringify({events:evs})});
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a'+
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA'+
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==','base64');

sect('Rien ne fuit avant la connexion');
const cat = await J('/api/catalogue', {}, '');
t('le catalogue répond sans session', cat.status===200);
t('mais ne livre AUCUN rôle', Array.isArray(cat.body.roles) && cat.body.roles.length===0,
  cat.body.roles.length + ' rôle(s)');
t('ni le nom de l’espace', cat.body.espace===null);
t('les rubriques restent là (la page de connexion en a besoin)', cat.body.cats.length>=17, cat.body.cats.length+' rubriques');
const ev = await J('/api/events', {}, '');
t('les journaux exigent une session', ev.status===401, 'HTTP '+ev.status);

sect('En-têtes de sécurité, y compris en JSON');
const h = cat.r.headers;
t('nosniff', h.get('x-content-type-options')==='nosniff');
t('pas d’affichage en cadre', h.get('x-frame-options')==='DENY');
t('politique de contenu', /frame-ancestors 'none'/.test(h.get('content-security-policy')||''));
// ⚠️ HSTS n'est posé QU'EN HTTPS : servi en clair, il n'aurait aucun effet
// et, une fois mémorisé, forcerait le domaine en HTTPS pendant des mois —
// de quoi rendre injoignable une machine servie en HTTP. Le test tourne en
// clair : l'en-tête doit donc être ABSENT ici.
t('⚠️ pas de HSTS en HTTP (il rendrait le domaine injoignable)',
  !h.get('strict-transport-security'), h.get('strict-transport-security')||'absent');

sect('Écritures : origine vérifiée');
const r0 = await fetch(B+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({pseudo:'Nyx',password:'motdepassetest123'})});
ck = (r0.headers.get('set-cookie')||'').split(';')[0];
t('le fondateur se connecte', r0.status===200, 'HTTP '+r0.status);
const bonneOrigine = await J('/api/marks',{method:'POST',body:JSON.stringify({id:1,kind:'done',on:true})},
  undefined);
t('une écriture sans en-tête Origin passe (client hors navigateur)', bonneOrigine.status!==403, 'HTTP '+bonneOrigine.status);
const mauvaise = await J('/api/marks',{method:'POST',
  headers:{origin:'https://site-mechant.example'},body:JSON.stringify({id:1,kind:'done',on:true})});
t('une écriture venue d’un AUTRE site est refusée', mauvaise.status===403, mauvaise.body?.error);
// ⚠️ L'adresse canonique (PUBLIC_URL) ne doit pas être la SEULE admise :
// une écriture depuis l'hôte réellement utilisé — localhost pendant
// l'installation, l'IP de la machine, un domaine de secours — reste la
// nôtre. Sinon le panneau devient inutilisable dès qu'on l'ouvre
// autrement que par le domaine.
const parHote = await J('/api/marks',{method:'POST',
  headers:{origin:B},body:JSON.stringify({id:1,kind:'done',on:true})});
t('une écriture depuis l’hôte utilisé passe', parHote.status!==403, 'HTTP '+parHote.status);
const lecture = await J('/api/events?limit=1',{headers:{origin:'https://site-mechant.example'}});
t('une simple lecture n’est pas bloquée pour autant', lecture.status===200, 'HTTP '+lecture.status);

sect('Frein anti-force-brute');
// Six essais : le sixième doit être freiné, quelle que soit l'adresse
// annoncée dans l'en-tête — c'est tout l'objet de TRUST_PROXY=0.
let freine = 0, statuts = [];
for (let i = 0; i < 7; i++) {
  const r = await fetch(B+'/api/auth/login',{method:'POST',
    headers:{'content-type':'application/json','x-forwarded-for':'10.0.0.'+i},
    body:JSON.stringify({pseudo:'PersonneIci',password:'faux'+i})});
  statuts.push(r.status);
  if (r.status===429) freine++;
}
t('changer d’en-tête ne contourne plus le frein', freine>0, statuts.join(' '));

sect('Débit : une clé qui fuite ne remplit pas le disque');
let refus = 0, envoyes = 0;
for (let i = 0; i < 140; i++) {
  const r = await ing([{cat:'connexions',sev:'info',msg:'rafale '+i}]);
  if (r.status === 429) refus++; else envoyes++;
}
t('le dépôt de journaux est plafonné', refus > 0, envoyes+' acceptés, '+refus+' refusés');
const apres = await ing([{cat:'connexions',sev:'info',msg:'encore'}]);
t('et le refus dit quand réessayer', apres.status===429 && !!apres.headers.get('retry-after'),
  'retry-after: '+apres.headers.get('retry-after'));

let refusCap = 0;
for (let i = 0; i < 25; i++) {
  const r = await fetch(B+'/api/screens',{method:'POST',
    headers:{'content-type':'application/octet-stream','x-origin-key':KEY,'x-screen-encoding':'base64',
             'x-screen-name':'Cible','x-screen-key':'license:zz'},
    body: JPEG.toString('base64')});
  if (r.status === 429) refusCap++;
}
t('le dépôt de captures est plafonné', refusCap > 0, refusCap+' refusées sur 25');

const mauvaiseCle = await fetch(B+'/api/ingest',{method:'POST',
  headers:{'content-type':'application/json','x-origin-key':'cle-inventee-0000'},body:'{"events":[]}'});
t('une clé inconnue est refusée', mauvaiseCle.status===401 || mauvaiseCle.status===429, 'HTTP '+mauvaiseCle.status);

sect('Captures : servies prudemment');
const liste = await J('/api/screens');
const id = liste.body.captures[0] && liste.body.captures[0].id;
t('une capture existe', !!id, 'capture #'+id);
const img = await fetch(B+'/api/screens/'+id,{headers:{cookie:ck}});
t('elle est servie avec nosniff', img.headers.get('x-content-type-options')==='nosniff');
t('et en affichage, sous un nom neutre', /^inline; filename="capture-/.test(img.headers.get('content-disposition')||''),
  img.headers.get('content-disposition'));
t('sans mise en cache', /no-store/.test(img.headers.get('cache-control')||''), img.headers.get('cache-control'));

const bad=T.filter(x=>!x[0]);
console.log(`\n  ${T.length-bad.length}/${T.length} contrôles passés`);
if(bad.length) console.log('  à corriger :\n   - '+bad.map(x=>x[1]).join('\n   - '));
process.exit(bad.length?1:0);
