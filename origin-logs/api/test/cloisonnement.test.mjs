// Lancé par « npm test » (test/run.js), qui pose une base neuve et
// démarre l'API dessus : ce fichier ne suppose que l'adresse reçue.
const B = process.env.BASE, KEY = process.env.KEY;
const T=[];const t=(n,ok,x='')=>{T.push([ok,n]);console.log((ok?'  ok    ':'  ÉCHEC ')+n+(x?'  → '+x:''));};
const sect=n=>console.log('\n── '+n+' '+'─'.repeat(Math.max(0,54-n.length)));
let ck='';
const J=async(p,o={},c)=>{const r=await fetch(B+p,{redirect:'manual',...o,headers:{'content-type':'application/json',cookie:c!==undefined?c:ck,...(o.headers||{})}});
  return {status:r.status, body:await r.json().catch(()=>null), r};};
const login=async(pseudo,mdp)=>{const r=await fetch(B+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({pseudo,password:mdp})}); return {status:r.status, ck:(r.headers.get('set-cookie')||'').split(';')[0], body:await r.json()};};

sect('Deux espaces, deux jeux de rôles');
const adm = await login('Sup','motdepassesup12345'); ck = adm.ck;
await J('/api/platform/enter',{method:'POST',body:JSON.stringify({spaceId:1})});
const sp2 = await J('/api/platform/spaces',{method:'POST',body:JSON.stringify({nom:'Second serveur',guildId:'555000222',staffRoleId:'900002',retention:7})});
const ID2 = sp2.body.id;
t('second espace créé', sp2.body.ok===true, 'espace #'+ID2);

// Espace 1 : on renomme un rôle intégré et on en crée un sur mesure.
await J('/api/roles/moderateur',{method:'PATCH',body:JSON.stringify({label:'Modo Origin',rank:52})});
const perso1 = await J('/api/roles',{method:'POST',body:JSON.stringify({label:'Régie Origin',rank:44,perms:['logs.view'],cats:['casino']})});
t('rôle sur mesure créé dans l’espace 1', perso1.body.ok===true, perso1.body.key);

// Espace 2 : le même nom doit être libre, et l'espace 1 ne doit pas bouger.
await J('/api/platform/enter',{method:'POST',body:JSON.stringify({spaceId:ID2})});
const r2 = await J('/api/roles');
const modo2 = r2.body.roles.find(x=>x.key==='moderateur');
t('l’espace 2 a ses propres rôles d’origine', r2.body.roles.length===14, r2.body.roles.length+' rôles');
t('le renommage de l’espace 1 ne l’a pas suivi', modo2 && modo2.label==='Modérateur', modo2 && modo2.label);
t('le rôle sur mesure de l’espace 1 est absent', !r2.body.roles.some(x=>x.key===perso1.body.key));
const perso2 = await J('/api/roles',{method:'POST',body:JSON.stringify({label:'Régie Origin',rank:44,perms:['logs.view'],cats:['casino']})});
t('la même clé est libre dans l’espace 2', perso2.body.ok===true && perso2.body.key===perso1.body.key, perso2.body.key);
const sup2 = await J('/api/roles/'+perso2.body.key,{method:'DELETE'});
t('la supprimer ici ne touche pas l’espace 1', sup2.status===200);
await J('/api/platform/enter',{method:'POST',body:JSON.stringify({spaceId:1})});
const r1 = await J('/api/roles');
t('l’espace 1 a gardé le sien', r1.body.roles.some(x=>x.key===perso1.body.key));
t('et son renommage', r1.body.roles.find(x=>x.key==='moderateur').label==='Modo Origin');

sect('Le même pseudo dans deux espaces');
await J('/api/staff',{method:'POST',body:JSON.stringify({pseudo:'Nyx',password:'motdepasseespace111',role:'moderateur'})});
const dejaIci = await J('/api/staff',{method:'POST',body:JSON.stringify({pseudo:'Nyx',password:'autrechosemdp123',role:'moderateur'})});
t('deux fois le même pseudo DANS un espace : refusé', dejaIci.status===409, dejaIci.body?.error);

await J('/api/platform/enter',{method:'POST',body:JSON.stringify({spaceId:ID2})});
const ailleurs = await J('/api/staff',{method:'POST',body:JSON.stringify({pseudo:'Nyx',password:'motdepasseespace222',role:'moderateur'})});
t('le même pseudo dans un AUTRE espace : accepté', ailleurs.body.ok===true, ailleurs.body?.error || 'créé');

const c1 = await login('Nyx','motdepasseespace111');
const c2 = await login('Nyx','motdepasseespace222');
t('chacun se connecte avec SON mot de passe', c1.status===200 && c2.status===200,
  'espace '+c1.body?.espace?.id+' / espace '+c2.body?.espace?.id);
t('et atterrit dans SON espace', c1.body.espace.id===1 && c2.body.espace.id===ID2,
  c1.body.espace.nom+' | '+c2.body.espace.nom);
const faux = await login('Nyx','motdepassequinexistepas');
t('un mauvais mot de passe reste refusé', faux.status===401, faux.body?.error);

// Deux comptes homonymes AVEC le même mot de passe : la connexion refuse
// plutôt que d'ouvrir le mauvais espace au hasard.
await J('/api/staff',{method:'POST',body:JSON.stringify({pseudo:'Jumeau',password:'motdepassejumeau12',role:'moderateur'})});
await J('/api/platform/enter',{method:'POST',body:JSON.stringify({spaceId:1})});
await J('/api/staff',{method:'POST',body:JSON.stringify({pseudo:'Jumeau',password:'motdepassejumeau12',role:'moderateur'})});
const ambigu = await login('Jumeau','motdepassejumeau12');
t('un homonyme au même mot de passe est REFUSÉ, pas tiré au sort', ambigu.status===409, ambigu.body?.error);

sect('Un membre ne voit que son espace');
const nyx1 = c1.ck;
const equipe = await J('/api/staff',{},nyx1);
t('le modérateur ne gère pas l’équipe', equipe.status===403, 'HTTP '+equipe.status);
const moi1 = await J('/api/auth/me',{},nyx1);
t('ses rôles sont résolus dans SON espace', moi1.body.staff.roleLabel==='Modo Origin', moi1.body.staff.roleLabel);
const moi2 = await J('/api/auth/me',{},c2.ck);
t('et ceux de l’autre dans le sien', moi2.body.staff.roleLabel==='Modérateur', moi2.body.staff.roleLabel);

const bad=T.filter(x=>!x[0]);
console.log(`\n  ${T.length-bad.length}/${T.length} contrôles passés`);
if(bad.length) console.log('  à corriger :\n   - '+bad.map(x=>x[1]).join('\n   - '));
process.exit(bad.length?1:0);
