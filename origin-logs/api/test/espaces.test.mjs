// Lancé par « npm test » (test/run.js), qui pose une base neuve et
// démarre l'API dessus : ce fichier ne suppose que l'adresse reçue.
const B = process.env.BASE;
const T=[];const t=(n,ok,x='')=>{T.push([ok,n]);console.log((ok?'  ok    ':'  ÉCHEC ')+n+(x?'  → '+x:''));};
const sect=n=>console.log('\n── '+n+' '+'─'.repeat(Math.max(0,54-n.length)));
let ck='', ckm='';
const J=async(p,o={},c)=>{const r=await fetch(B+p,{redirect:'manual',...o,headers:{'content-type':'application/json',cookie:c!==undefined?c:ck,...(o.headers||{})}});
  return {status:r.status, body:await r.json().catch(()=>null), r};};
const KEY = process.env.KEY;
const ing=(evs,key=KEY)=>fetch(B+'/api/ingest',{method:'POST',headers:{'content-type':'application/json','x-origin-key':key},body:JSON.stringify({events:evs})});

sect('Cloisonnement des espaces');
let r=await fetch(B+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pseudo:'Owen',password:'motdepasseowen123'})});
ck=(r.headers.get('set-cookie')||'').split(';')[0];
const me0=await r.json();
// L'administration de plateforme se connecte HORS de tout espace : c'est
// la règle, et le premier contrôle de cette suite.
t('administration connectée, sans aucun espace', me0.plateforme===true && me0.espace===null, String(me0.espace));
const horsEspace=await J('/api/events?limit=5');
t('les routes d’espace refusent tant qu’on n’est entré nulle part', horsEspace.status===409, horsEspace.body?.error);
const entre=await J('/api/platform/enter',{method:'POST',body:JSON.stringify({spaceId:1})});
t('entrer dans un espace est un geste', entre.body.ok===true, entre.body.espace);
const me1=await J('/api/auth/me');
t('la visite est signalée dès le premier espace', me1.body.espace.id===1 && me1.body.espace.visite===true, me1.body.espace.nom);

await ing([{cat:'connexions',sev:'info',actor:{key:'license:aaa',name:'Joueur A',sid:1},msg:'Message dans espace 1'}]);
const sp2=await J('/api/platform/spaces',{method:'POST',body:JSON.stringify({nom:'Espace deux',guildId:'555000111',staffRoleId:'900001',retention:7})});
t('espace créé avec sa propre clé', sp2.body.ok===true && !!sp2.body.cle && sp2.body.cle!==KEY);
const K2=sp2.body.cle, ID2=sp2.body.id;
await ing([{cat:'connexions',sev:'info',actor:{key:'license:bbb',name:'Joueur B',sid:2},msg:'Message dans espace 2'}],K2);

const ev1=await J('/api/events?limit=50');
t('espace 1 ne voit que ses évènements', ev1.body.events.every(e=>/espace 1/.test(e.msg)||!/espace 2/.test(e.msg)) && ev1.body.events.some(e=>/espace 1/.test(e.msg)), ev1.body.total+' évènements');
t('aucune fuite depuis l’espace 2', !ev1.body.events.some(e=>/espace 2/.test(e.msg)));
const st1=await J('/api/stats?from='+(Date.now()-3600e3)+'&to='+Date.now());
t('statistiques cloisonnées', st1.body.total===ev1.body.total, 'stats='+st1.body.total);

await J('/api/platform/enter',{method:'POST',body:JSON.stringify({spaceId:ID2})});
const ev2=await J('/api/events?limit=50');
t('visite d’un autre espace : on voit le sien', ev2.body.events.some(e=>/espace 2/.test(e.msg)) && !ev2.body.events.some(e=>/espace 1/.test(e.msg)));
const me2=await J('/api/auth/me');
t('la visite est signalée', me2.body.espace.visite===true && me2.body.espace.id===ID2, me2.body.espace.nom);
await J('/api/platform/enter',{method:'POST',body:JSON.stringify({spaceId:1})});

sect('Ressortir d’un espace');
await J('/api/platform/enter',{method:'POST',body:JSON.stringify({spaceId:0})});
const meS=await J('/api/auth/me');
t('on ressort d’un espace', meS.body.espace===null, String(meS.body.espace));
const apresSortie=await J('/api/events?limit=5');
t('et les routes d’espace redeviennent sans objet', apresSortie.status===409, apresSortie.body?.error);
await J('/api/platform/enter',{method:'POST',body:JSON.stringify({spaceId:1})});

sect('Clé d’ingestion');
const mauvaiseCle=await ing([{cat:'connexions',sev:'info',msg:'x'}],'cle-inventee-xxxxxxxxxxxxxx');
t('clé inconnue refusée', mauvaiseCle.status===401);

sect('Rôles : création et composition (fondateur non-plateforme)');
// Un fondateur ordinaire : c'est lui qui doit être borné par son rang.
await J('/api/staff',{method:'POST',body:JSON.stringify({pseudo:'Fondat2',password:'motdepassefond456',role:'administrateur'})});
const ckAdmin=await (async()=>{const x=await fetch(B+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({pseudo:'Fondat2',password:'motdepassefond456'})});return (x.headers.get('set-cookie')||'').split(';')[0];})();
const rr=await J('/api/roles');
t('14 rôles d’origine semés', rr.body.roles.length===14, rr.body.roles.map(x=>x.label).slice(0,3).join(', ')+'…');
const TOUTES = (await J('/api/catalogue')).body.cats.map(c => c.id);
t('rangs et rubriques présents', rr.body.roles[0].rank===100
  && TOUTES.every(c => rr.body.roles[0].cats.includes(c)), rr.body.roles[0].cats.length+'/'+TOUTES.length);
const cree=await J('/api/roles',{method:'POST',body:JSON.stringify({label:'Responsable Boutique',rank:55,discordRoleId:'900055',perms:['logs.view','players.view'],cats:['boutique_caisse','boutique_produits']})});
t('rôle personnalisé créé', cree.body.ok===true, cree.body.key);
const trop=await J('/api/roles',{method:'POST',body:JSON.stringify({label:'Au-dessus',rank:200})},ckAdmin);
t('administrateur : rôle au-dessus du sien refusé', trop.status===403, trop.body.error);
const tropF=await J('/api/roles',{method:'POST',body:JSON.stringify({label:'Au-dessus',rank:200})});
t('administrateur de plateforme : non borné (voulu)', tropF.body.ok===true);
const maj=await J('/api/roles/'+cree.body.key,{method:'PATCH',body:JSON.stringify({cats:['boutique_caisse','boutique_produits','connexions'],perms:['logs.view','players.view','actions.warn']})});
t('rubriques et droits modifiables', maj.body.ok===true);
const apres=(await J('/api/roles')).body.roles.find(x=>x.key===cree.body.key);
t('modification persistée', apres.cats.length===3 && apres.perms.includes('actions.warn'), apres.cats.join(','));
const delFond=await J('/api/roles/fondateur',{method:'DELETE'},ckAdmin);
t('administrateur : rôle au-dessus de lui protégé', delFond.status===403, delFond.body.error);
const delMod=await J('/api/roles/moderateur',{method:'DELETE'});
t('rôle d’origine non supprimable', delMod.status===409, delMod.body.error);

sect('Attribution manuelle des rôles');
// Le jeu d'essai se pose lui-même : le test ne doit rien devoir à une base déjà remplie.
await J('/api/staff',{method:'POST',body:JSON.stringify({pseudo:'Kaleb',password:'motdepassetest456',role:'moderateur'})});
const eq=await J('/api/staff');
const kaleb=eq.body.staff.find(x=>x.pseudo==='Kaleb');
t('équipe listée avec rôles', !!kaleb && kaleb.roles.length===1, kaleb?.roles.map(x=>x.label).join('+'));
const att=await J('/api/staff/'+kaleb.id,{method:'PATCH',body:JSON.stringify({roles:['moderateur','animateur']})});
t('attribution manuelle de deux rôles', att.body.ok===true);
const eq2=await J('/api/staff');
const k2=eq2.body.staff.find(x=>x.id===kaleb.id);
t('rôles cumulés et marqués manuels', k2.roles.length===2 && k2.manual===true, k2.roles.map(x=>x.label).join(' + '));
const tropHaut=await J('/api/staff/'+kaleb.id,{method:'PATCH',body:JSON.stringify({roles:['fondateur']})},ckAdmin);
t('administrateur : attribuer un rôle au-dessus refusé', tropHaut.status===403, tropHaut.body.error);
const propre=await J('/api/staff/'+kaleb.id,{method:'PATCH',body:JSON.stringify({roles:['moderateur','animateur']})});
t('rôles remis en place après le test', propre.body.ok===true);

sect('Espaces : fermeture, propriétaire, suppression');
const ferme=await J('/api/platform/spaces/'+ID2,{method:'PATCH',body:JSON.stringify({etat:'ferme',motif:'Test de fermeture'})});
t('espace fermé', ferme.body.ok===true);
const listeF=await J('/api/platform/spaces');
t('état « fermé » visible', listeF.body.spaces.find(x=>x.id===ID2).etat==='ferme');
const ingFerme=await ing([{cat:'connexions',sev:'info',msg:'après fermeture'}],K2);
t('un espace fermé n’accepte plus de logs', ingFerme.status===401, 'HTTP '+ingFerme.status);
await J('/api/platform/spaces/'+ID2,{method:'PATCH',body:JSON.stringify({etat:'actif'})});
const proprioNon=await J('/api/platform/spaces/'+ID2,{method:'PATCH',body:JSON.stringify({proprietaire:1})});
t('propriétaire hors de l’espace refusé', proprioNon.status===409, proprioNon.body.error);
const supNom=await J('/api/platform/spaces/'+ID2+'?confirme=mauvais',{method:'DELETE'});
t('suppression sans le bon nom refusée', supNom.status===400);

sect('En visite, l’administration passe avant le fondateur');
// On crée un fondateur DANS l'espace visité, puis on vérifie que
// l'administration de plateforme reste au-dessus de lui — sinon entrer
// dans un espace reviendrait à s'y soumettre.
await J('/api/platform/enter',{method:'POST',body:JSON.stringify({spaceId:ID2})});
const fondLocal=await J('/api/staff',{method:'POST',body:JSON.stringify({pseudo:'FondLocal',password:'motdepasselocal789',role:'fondateur'})});
t('fondateur créé dans l’espace visité', fondLocal.body.ok===true || !!fondLocal.body.staff, fondLocal.body.error||'');
const moiIci=await J('/api/auth/me');
t('toutes les rubriques, même en visite', TOUTES.every(c => moiIci.body.cats.includes(c)), moiIci.body.cats.length+'/'+TOUTES.length+' rubriques');
t('tous les droits, même en visite', moiIci.body.perms.length>=14, moiIci.body.perms.length+' droits');
const eqIci=await J('/api/staff');
const cible=eqIci.body.staff.find(x=>x.pseudo==='FondLocal');
const retro=await J('/api/staff/'+cible.id,{method:'PATCH',body:JSON.stringify({roles:['moderateur']})});
t('elle peut rétrograder un fondateur de cet espace', retro.body.ok===true, retro.body.error||'');
// Les rôles appartiennent à l'espace : on en crée un ICI pour vérifier
// qu'on peut le composer et le retirer sans être membre de cet espace.
const roleIci=await J('/api/roles',{method:'POST',body:JSON.stringify({label:'Régie Boutique',rank:70,perms:['logs.view'],cats:['boutique_caisse']})});
t('elle crée un rôle dans l’espace visité', roleIci.body.ok===true, roleIci.body.key||roleIci.body.error);
const supRole=await J('/api/roles/'+roleIci.body.key,{method:'DELETE'});
t('et le retire', supRole.status===200, 'HTTP '+supRole.status);
await J('/api/platform/enter',{method:'POST',body:JSON.stringify({spaceId:1})});

sect('Permissions : ce qu’un modérateur ne peut pas');
let rm=await fetch(B+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pseudo:'Kaleb',password:'motdepassetest456'})});
ckm=(rm.headers.get('set-cookie')||'').split(';')[0];
const mem=await rm.json();
t('modérateur : rôles cumulés appliqués', mem.staff.roles.length===2, mem.staff.roles.map(x=>x.label).join(' + '));
for (const [nom,p,o] of [
  ['éditer les rôles','/api/roles',{}],
  ['créer un rôle','/api/roles',{method:'POST',body:'{}'}],
  ['voir les espaces','/api/platform/spaces',{}],
  ['créer un espace','/api/platform/spaces',{method:'POST',body:'{}'}],
  ['entrer dans un espace','/api/platform/enter',{method:'POST',body:'{"spaceId":1}'}],
  ['gérer l’équipe','/api/staff',{}],
  ['configurer Discord','/api/discord/config',{}]
]) { const x=await J(p,o,ckm); t('modérateur ne peut pas '+nom, x.status===403, 'HTTP '+x.status); }

sect('Le dernier fondateur et soi-même');
const autoSup=await J('/api/staff/'+me0Id(),{method:'DELETE'});
function me0Id(){return 1;}
t('on ne se supprime pas soi-même', autoSup.status===400, autoSup.body?.error);

const bad=T.filter(x=>!x[0]);
console.log(`\n  ${T.length-bad.length}/${T.length} contrôles passés`);
if(bad.length) console.log('  à corriger :\n   - '+bad.map(x=>x[1]).join('\n   - '));
process.exit(bad.length?1:0);
