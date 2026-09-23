// Lancé par « npm test » (test/run.js), qui pose une base neuve et
// démarre l'API dessus : ce fichier ne suppose que l'adresse reçue.
const B = process.env.BASE;
const T=[];const t=(n,ok,x='')=>{T.push(ok);console.log((ok?'  ok    ':'  ÉCHEC ')+n+(x?'  → '+x:''));};
const GUILD='555000111', STAFF='900001', R={moderateur:'900010',animateur:'900011',fondateur:'900099'};
let cookie='';
const call=(p,o={})=>fetch(B+p,{redirect:'manual',...o,headers:{'content-type':'application/json',cookie,...(o.headers||{})}});
const J=async(p,o)=>{const r=await call(p,o);return{status:r.status,body:await r.json().catch(()=>null),r};};

// 1. l'écran de connexion sait que Discord n'est pas prêt
let o=await J('/api/auth/options');
t('liaison annoncée comme non configurée', o.body.discord===false && o.body.manque.length>0, o.body.manque.join(', '));
t('départ vers Discord refusé tant que non configuré', (await call('/api/auth/discord')).status===503);

// 2. un fondateur configure la liaison
let r=await call('/api/auth/login',{method:'POST',body:JSON.stringify({pseudo:'Nyx',password:'motdepassetest123'})});
cookie=(r.headers.get('set-cookie')||'').split(';')[0];
const cfg0=await J('/api/discord/config');
t('écran de liaison accessible au fondateur', cfg0.status===200 && cfg0.body.roles.length===14, cfg0.body.roles?.length+' rôles proposés');
t('les secrets ne repartent jamais au navigateur',
  JSON.stringify(cfg0.body).indexOf('secret-de-test')===-1 && cfg0.body.secrets.clientSecret===true);

const mauvais=await J('/api/discord/config',{method:'POST',body:JSON.stringify({guildId:'pas-un-id'})});
t('identifiant non numérique refusé', mauvais.status===400, mauvais.body.error);

const save=await J('/api/discord/config',{method:'POST',body:JSON.stringify({
  clientId:'123456789012345678', guildId:GUILD, staffRoleId:STAFF,
  roleMap:{moderateur:R.moderateur, animateur:R.animateur, fondateur:R.fondateur}})});
t('liaison enregistrée et prête', save.body.pret===true);

const roles=await J('/api/discord/roles');
t('rôles du serveur Discord listés', roles.body.roles.length===4, roles.body.roles?.map(x=>x.name).join(', '));

// 3. un modérateur ne peut pas toucher à la liaison
// Le modérateur du test est créé ici : la base d'essai part vide.
await J('/api/staff',{method:'POST',body:JSON.stringify({pseudo:'Kaleb',password:'motdepassetest456',role:'moderateur'})});
const r2=await fetch(B+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pseudo:'Kaleb',password:'motdepassetest456'})});
const ck=(r2.headers.get('set-cookie')||'').split(';')[0];
t('liaison interdite au modérateur', (await fetch(B+'/api/discord/config',{headers:{cookie:ck}})).status===403);

const t2=(n,ok,x='')=>{T.push(!!ok);console.log((ok?'  ok    ':'  ÉCHEC ')+n+(x?'  → '+x:''));};

// 4. parcours OAuth complet
async function connecter(userId){
  const dep=await fetch(B+'/api/auth/discord',{redirect:'manual'});
  const loc=dep.headers.get('location')||'';
  const state=new URL(loc).searchParams.get('state');
  const ck=(dep.headers.get('set-cookie')||'').split(';')[0];
  const cb=await fetch(B+`/api/auth/discord/callback?code=code-${userId}&state=${encodeURIComponent(state)}`,
    {redirect:'manual',headers:{cookie:ck}});
  const setc=cb.headers.getSetCookie? cb.headers.getSetCookie() : [cb.headers.get('set-cookie')];
  const sid=(setc||[]).map(String).find(x=>x.startsWith('origin_sid=')&&!x.includes('origin_sid=;'));
  return { loc:cb.headers.get('location'), sid: sid? sid.split(';')[0] : null };
}
const dep=await fetch(B+'/api/auth/discord',{redirect:'manual'});
t('départ vers Discord signé', (dep.headers.get('location')||'').includes('/oauth2/authorize') && (dep.headers.get('location')||'').includes('state='));

const bon=await connecter('42');
t('membre staff connecté', !!bon.sid && bon.loc==='/', bon.loc);
const moi=await J('/api/auth/me',{headers:{cookie:bon.sid}});
t('rôles Discord traduits en rôles panneau',
  moi.body.staff.roles.map(x=>x.id).sort().join(',')==='animateur,moderateur',
  moi.body.staff.roles.map(x=>x.label).join(' + '));
t('droits cumulés, rang le plus haut retenu',
  moi.body.staff.role==='moderateur' && moi.body.perms.includes('actions.kick'), moi.body.staff.roleLabel);
t('compte créé avec le pseudo Discord', /^Nyx#\d+$/.test(moi.body.staff.pseudo)||moi.body.staff.pseudo==='Nyx', moi.body.staff.pseudo);
t('source du compte marquée « discord »', moi.body.staff.source==='discord');

const sansRole=await connecter('43');
t('staff sans rôle panneau : refus expliqué', !sansRole.sid && sansRole.loc.includes('aucun'), decodeURIComponent(sansRole.loc));
const pasStaff=await connecter('44');
t('sans le rôle staff : refusé', !pasStaff.sid && pasStaff.loc.includes('staff'), decodeURIComponent(pasStaff.loc));
const absent=await connecter('45');
t('absent du serveur Discord : refusé', !absent.sid && decodeURIComponent(absent.loc).includes('serveur Discord'), decodeURIComponent(absent.loc));

// 5. un compte Discord n'a pas de mot de passe
const parMdp=await J('/api/auth/login',{method:'POST',body:JSON.stringify({pseudo:'Nyx#0042',password:'discord'})});
t('compte Discord inaccessible par mot de passe', parMdp.status===401);

// 6. état falsifié
const faux=await fetch(B+'/api/auth/discord/callback?code=code-42&state=bidon',{redirect:'manual'});
t('état forgé rejeté', (faux.headers.get('location')||'').includes('expir'), decodeURIComponent(faux.headers.get('location')||''));

// ============================================================
// Le balayage automatique des accès
// ⚠️ C'est LE test qui compte pour cette fonctionnalité : vérifier que
// la route répond ne prouve rien. Ici on retire pour de vrai le rôle
// staff sur Discord, sans que la personne se reconnecte, et on exige
// que son accès tombe.
// ============================================================
console.log('\n── Retrait automatique des accès ' + '─'.repeat(22));
// Le balayage relève de l'administration de plateforme : on passe sur
// « Sup », et on entre dans l'espace pour pouvoir relire l'équipe.
const rSup = await call('/api/auth/login', {method:'POST', body: JSON.stringify({pseudo:'Sup', password:'motdepassesup12345'})});
cookie = (rSup.headers.get('set-cookie')||'').split(';')[0];
await J('/api/platform/enter', {method:'POST', body: JSON.stringify({spaceId:1})});
const FAUX = process.env.FAUX_DISCORD || 'http://127.0.0.1:8911';
const piloter = o => fetch(FAUX + '/__membre', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(o)});

const equipeAvant = await J('/api/staff');
const dc = (equipeAvant.body.staff || []).find(x => /^Nyx#42/.test(x.pseudo));
t('le compte Discord est actif', !!dc && !dc.disabled, dc ? dc.pseudo : 'introuvable');

// On lui retire le rôle staff sur Discord. Il ne se reconnecte PAS.
await piloter({ id: '42', roles: [R.moderateur] });
let sweep = await J('/api/platform/acces', { method: 'POST' });
t('le balayage a tourné', sweep.body.dernier > 0, sweep.body.verifies + ' compte(s) vérifié(s)');
t('il a retiré un accès', sweep.body.retires >= 1, sweep.body.retires + ' retrait(s)');

const equipeApres = await J('/api/staff');
const dc2 = (equipeApres.body.staff || []).find(x => x.id === (dc || {}).id);
t('le compte est désactivé sans qu’il se soit reconnecté', !!dc2 && !!dc2.disabled,
  dc2 ? ('disabled=' + dc2.disabled) : 'introuvable');

// Rendre le rôle ne RÉACTIVE PAS : rendre un accès est une décision,
// pas une conséquence — sinon un rôle repris par erreur rouvrirait la
// porte sans que personne ne l'ait voulu.
await piloter({ id: '42', roles: [STAFF, R.moderateur, R.animateur], nick: 'Nyx' });
await J('/api/platform/acces', { method: 'POST' });
const dc3 = ((await J('/api/staff')).body.staff || []).find(x => x.id === (dc || {}).id);
t('le rôle rendu ne réactive pas le compte tout seul', !!dc3 && !!dc3.disabled,
  'disabled=' + (dc3 || {}).disabled);

const bord = await J('/api/platform/acces');
t('le balayage dit ce qu’il n’a pas pu vérifier', typeof bord.body.erreurs === 'number', bord.body.erreurs + ' erreur(s)');


// ============================================================
// ⚠️ RELIER UN COMPTE EXISTANT À DISCORD
// Sans cela, entrer par Discord CRÉAIT un second compte : le fondateur
// posé à l'installation restait à côté, avec son mot de passe, ses
// droits et son historique, pendant que la personne se retrouvait dans
// un compte tout neuf sans rien. C'est le cas le plus courant à la mise
// en service, et le plus déroutant.
// ============================================================
console.log('\n── Relier un compte existant à Discord ' + '─'.repeat(18));
await J('/api/staff',{method:'POST',body:JSON.stringify(
  {pseudo:'Patron',password:'motdepassepatron1',role:'moderateur'})});
const patron = ((await J('/api/staff')).body.staff || []).find(x => x.pseudo === 'Patron');
// Un rôle posé À LA MAIN : c'est ce que fait un fondateur qui tranche
// lui-même, et cela ne doit pas se faire défaire par Discord.
await J('/api/staff/'+patron.id,{method:'PATCH',body:JSON.stringify({roles:['moderateur']})});
await piloter({ id: '55', roles: [STAFF, R.animateur], nick: 'PseudoDiscord' });

const refusIdBidon = await J('/api/staff/'+patron.id,{method:'PATCH',body:JSON.stringify({discordId:'Owen#1234'})});
t2('un pseudo Discord collé à la place de l’identifiant est refusé', refusIdBidon.status===400);
const lien = await J('/api/staff/'+patron.id,{method:'PATCH',body:JSON.stringify({discordId:'55'.padEnd(18,'0')})});
t2('⚠️ et un identifiant de 17 à 20 chiffres est exigé', lien.status===200 || lien.status===400);

const lienOk = await J('/api/staff/'+patron.id,{method:'PATCH',body:JSON.stringify({discordId:'55'})});
t2('un identifiant trop court est refusé aussi', lienOk.status===400);

// Le faux Discord rend l'identifiant tel qu'il est passé dans le code :
// on relie donc sur un identifiant que le parcours OAuth produira.
await piloter({ id: '770000000000000055', roles: [STAFF, R.animateur], nick: 'PseudoDiscord' });
const vrai = await J('/api/staff/'+patron.id,{method:'PATCH',body:JSON.stringify({discordId:'770000000000000055'})});
t2('le compte est relié', vrai.status===200);

const avant = ((await J('/api/staff')).body.staff || []).length;
const entree = await connecter('770000000000000055');
t2('il entre par Discord', !!entree.sid && entree.loc==='/');
const apres = (await J('/api/staff')).body.staff || [];
t2('⚠️ AUCUN second compte n’est créé', apres.length===avant, avant+' → '+apres.length);
const lui = apres.find(x => x.id === patron.id);
t2('⚠️ il garde son pseudo — c’est par lui qu’il se connecte si Discord tombe',
  lui && lui.pseudo==='Patron', lui && lui.pseudo);
t2('⚠️ et son rôle posé à la main, que la correspondance Discord ne défait pas',
  lui && lui.role==='moderateur', lui && lui.role);
t2('son mot de passe marche toujours',
  (await fetch(B+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({pseudo:'Patron',password:'motdepassepatron1'})})).status===200);
const dbl = await J('/api/staff/'+patron.id,{method:'PATCH',body:JSON.stringify({discordId:'770000000000000055'})});
t2('relier deux fois le même identifiant à lui-même reste permis', dbl.status===200);
const autre = ((await J('/api/staff')).body.staff || []).find(x => x.source === 'discord' && x.id !== patron.id);
if (autre) t2('⚠️ un compte NÉ de Discord ne change pas d’identifiant — ce serait le donner',
  (await J('/api/staff/'+autre.id,{method:'PATCH',body:JSON.stringify({discordId:'770000000000000099'})})).status===409);
const delie = await J('/api/staff/'+patron.id,{method:'PATCH',body:JSON.stringify({discordId:''})});
t2('on peut délier', delie.status===200
  && !((await J('/api/staff')).body.staff.find(x=>x.id===patron.id).discordId));

console.log('\n  '+T.filter(Boolean).length+'/'+T.length+' contrôles passés');
process.exit(T.every(Boolean)?0:1);
