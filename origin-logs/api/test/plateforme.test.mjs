// L'équipe de la PLATEFORME — celle de l'éditeur, pas celle d'un client.
// ⚠️ Deux catalogues de droits qui ne se recouvrent pas : les mélanger
// donnerait un commercial capable de bannir un joueur, ou un modérateur
// capable de supprimer l'espace qu'il modère.
const B = process.env.BASE;
const T=[];const t=(n,ok,x='')=>{T.push([ok,n]);console.log((ok?'  ok    ':'  ÉCHEC ')+n+(x?'  → '+x:''));};
const sect=n=>console.log('\n── '+n+' '+'─'.repeat(Math.max(0,54-n.length)));
const J=async(p,o={},c)=>{const r=await fetch(B+p,{redirect:'manual',...o,
  headers:{'content-type':'application/json',...(c!==undefined?{cookie:c}:{}),...(o.headers||{})}});
  return {status:r.status, body:await r.json().catch(()=>null), r};};
const login=async(pseudo,mdp)=>{const r=await fetch(B+'/api/auth/login',{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({pseudo,password:mdp})});
  return (r.headers.get('set-cookie')||'').split(';')[0];};

const PLAT = await import('../plateforme.js');
const patron = await login('Sup','motdepassesup12345');

sect('Le catalogue des droits de plateforme');
t('il est distinct de celui des espaces', PLAT.PERM_IDS.every(x=>x.startsWith('plat.')),
  PLAT.PERM_IDS.length+' droits');
t('cinq rôles d’origine', PLAT.ROLES_DEFAUT.length===5,
  PLAT.ROLES_DEFAUT.map(r=>r.key).join(', '));
t('⚠️ la Direction a tous les droits EN DUR, pas une liste enregistrée',
  PLAT.ROLES_DEFAUT.find(r=>r.key==='direction').perms==='*');
t('un commercial n’entre pas chez les clients',
  !PLAT.ROLES_DEFAUT.find(r=>r.key==='commercial').perms.includes('plat.entrer'));
t('un support n’a pas la suppression d’espace',
  !PLAT.ROLES_DEFAUT.find(r=>r.key==='support').perms.includes('plat.espace.supprimer'));
t('ni les tarifs', !PLAT.ROLES_DEFAUT.find(r=>r.key==='support').perms.includes('plat.formules'));

sect('Le compte historique devient « Direction »');
const moi = await J('/api/auth/me',{},patron);
t('⚠️ un administrateur d’avant les rôles ne se réveille pas sans droits',
  moi.body.staff.plateformeRole==='direction', moi.body.staff.plateformeRole);
t('et il porte tous les droits', (moi.body.platPerms||[]).length===PLAT.PERM_IDS.length,
  (moi.body.platPerms||[]).length+'/'+PLAT.PERM_IDS.length);

sect('Les rôles se listent et se composent');
const r0 = await J('/api/platform/roles',{},patron);
t('la liste est servie', r0.status===200 && r0.body.roles.length===5);
t('avec le catalogue et ses groupes', r0.body.perms.length===PLAT.PERM_IDS.length && r0.body.groupes.length>=4);
t('et le nombre de porteurs par rôle', r0.body.roles.every(x=>typeof x.membres==='number'));

const neuf = await J('/api/platform/roles',{method:'POST',body:JSON.stringify(
  {label:'Facturation', rang:40, perms:['plat.voir','plat.facturation']})},patron);
t('on crée un rôle', neuf.status===200 && neuf.body.key==='facturation', neuf.body.key);
const maj = await J('/api/platform/roles/facturation',{method:'PATCH',body:JSON.stringify(
  {perms:['plat.voir','plat.facturation','plat.formules']})},patron);
t('on le recompose', maj.status===200);
t('⚠️ la Direction ne se retouche pas — c’est elle qui rouvre tout',
  (await J('/api/platform/roles/direction',{method:'PATCH',body:JSON.stringify({perms:[]})},patron)).status===409);

sect('Un commercial : ce qu’il peut, ce qu’il ne peut pas');
// Créer un compte se fait DANS un espace : l'administration de plateforme
// n'en habite aucun, elle doit donc y entrer d'abord.
await J('/api/platform/enter',{method:'POST',body:JSON.stringify({spaceId:1})},patron);
const cree0 = await J('/api/staff',{method:'POST',body:JSON.stringify(
  {pseudo:'Vendeur',password:'motdepassevendeur1',role:'moderateur'})},patron);
t('un compte est créé pour le test', cree0.status===200, cree0.body && cree0.body.error);
const liste = await J('/api/platform/members',{},patron);
const v = (liste.body.members||[]).find(x=>x.pseudo==='Vendeur');
const ajout = await J('/api/platform/members/'+v.id,{method:'PATCH',body:JSON.stringify(
  {platform:true, platformRole:'commercial'})},patron);
t('on l’ajoute à l’équipe en Commercial', ajout.status===200);

const ck = await login('Vendeur','motdepassevendeur1');
const moiV = await J('/api/auth/me',{},ck);
t('il se connecte sur la plateforme', moiV.body.staff.plateforme===true);
t('son rôle est annoncé', moiV.body.staff.plateformeRoleLabel==='Commercial',
  moiV.body.staff.plateformeRoleLabel);

t('✔ il voit la supervision', (await J('/api/platform/overview',{},ck)).status===200);
const cree = await J('/api/platform/spaces',{method:'POST',body:JSON.stringify(
  {nom:'Client du commercial',guildId:'555777111',staffRoleId:'900777'})},ck);
t('✔ il crée un espace client', cree.status===200, cree.body.error||'');
const IDC = cree.body.id;
t('✔ il pose une formule', (await J('/api/platform/spaces/'+IDC,{method:'PATCH',
  body:JSON.stringify({formule:'starter'})},ck)).status===200);

const supp = await J('/api/platform/spaces/'+IDC+'?confirme='+encodeURIComponent('Client du commercial'),
  {method:'DELETE'},ck);
t('⚠️ il NE supprime PAS un espace', supp.status===403, supp.body && supp.body.error);
t('⚠️ le refus NOMME le droit manquant',
  /supprimer un espace/i.test((supp.body||{}).error||''), (supp.body||{}).error);
const entrer = await J('/api/platform/enter',{method:'POST',body:JSON.stringify({spaceId:1})},ck);
t('⚠️ il n’entre pas dans les journaux d’un client', entrer.status===403);
const sauv = await J('/api/platform/sauvegardes',{},ck);
t('⚠️ il ne touche pas aux sauvegardes', sauv.status===403);
const cle = await J('/api/platform/spaces/'+IDC,{method:'PATCH',body:JSON.stringify({regenererCle:true})},ck);
t('⚠️ ni ne régénère une clé d’ingestion', cle.status===403);
const jrn = await J('/api/platform/journal',{},ck);
t('⚠️ ni ne lit le journal d’administration', jrn.status===403);

sect('Anti-escalade');
const monter = await J('/api/platform/roles',{method:'POST',body:JSON.stringify(
  {label:'Super', rang:999, perms:['plat.espace.supprimer']})},ck);
t('⚠️ il ne compose pas les rôles du tout', monter.status===403, monter.body && monter.body.error);
const promo = await J('/api/platform/members/'+v.id,{method:'PATCH',body:JSON.stringify(
  {platformRole:'direction'})},ck);
t('⚠️ et il ne se promeut pas lui-même', promo.status===403, promo.body && promo.body.error);

// ⚠️ LE CAS QUI COMPTE : quelqu'un qui PEUT composer des rôles, mais qui
// ne détient pas le droit qu'il essaie d'accorder. Sans cette règle, un
// droit de composition suffisait à s'attribuer tout le reste.
await J('/api/platform/roles',{method:'POST',body:JSON.stringify(
  {label:'Adjoint', rang:70, perms:['plat.voir','plat.roles','plat.equipe.voir','plat.equipe.gerer']})},patron);
await J('/api/platform/members/'+v.id,{method:'PATCH',body:JSON.stringify({platformRole:'adjoint'})},patron);
const ckT = await login('Vendeur','motdepassevendeur1');
const composeOk = await J('/api/platform/roles/facturation',{method:'PATCH',body:JSON.stringify(
  {perms:['plat.voir']})},ckT);
t('✔ il compose bien les rôles sous le sien', composeOk.status===200, composeOk.body && composeOk.body.error);
const tropLarge = await J('/api/platform/roles/facturation',{method:'PATCH',body:JSON.stringify(
  {perms:['plat.voir','plat.espace.supprimer']})},ckT);
t('⚠️ mais il n’accorde PAS un droit qu’il ne détient pas lui-même',
  tropLarge.status===403, tropLarge.body && tropLarge.body.error);
const auDessus = await J('/api/platform/roles/technique',{method:'PATCH',body:JSON.stringify(
  {perms:['plat.voir']})},ckT);
t('⚠️ ni ne touche à un rôle de rang supérieur au sien', auDessus.status===403,
  auDessus.body && auDessus.body.error);

sect('Le Discord officiel de la plateforme');
const dc = await J('/api/platform/discord',{},patron);
t('la liaison est lisible', dc.status===200 && Array.isArray(dc.body.roles));
t('⚠️ elle liste les rôles de PLATEFORME, pas ceux d’un espace',
  dc.body.roles.some(r=>r.key==='commercial') && !dc.body.roles.some(r=>r.key==='moderateur'),
  dc.body.roles.map(r=>r.key).join(', '));
const dcBad = await J('/api/platform/discord',{method:'POST',body:JSON.stringify({guildId:'pas-un-id'})},patron);
t('un identifiant non numérique est refusé', dcBad.status===400);
const dcOk = await J('/api/platform/discord',{method:'POST',body:JSON.stringify(
  {guildId:'555000999', roleMap:{support:'900010', commercial:'900011'}})},patron);
t('la liaison s’enregistre', dcOk.status===200);
const relu = await J('/api/platform/discord',{},patron);
t('et se relit', relu.body.guildId==='555000999' && relu.body.roleMap.support==='900010');
// ⚠️ Régler la liaison, c'est nommer qui on veut dans l'équipe : le
// réglage porte donc le même droit que la composition des rôles.
await J('/api/staff',{method:'POST',body:JSON.stringify(
  {pseudo:'Curieux',password:'motdepassecurieux1',role:'moderateur'})},patron);
const cur = ((await J('/api/platform/members',{},patron)).body.members||[]).find(x=>x.pseudo==='Curieux');
await J('/api/platform/members/'+cur.id,{method:'PATCH',body:JSON.stringify(
  {platform:true, platformRole:'observateur'})},patron);
const ckObs = await login('Curieux','motdepassecurieux1');
t('un observateur lit la liaison', (await J('/api/platform/discord',{},ckObs)).status===200);
const dcObs = await J('/api/platform/discord',{method:'POST',body:JSON.stringify({guildId:'1'})},ckObs);
t('⚠️ mais ne la règle pas : ce serait nommer qui il veut dans l’équipe',
  dcObs.status===403, dcObs.body && dcObs.body.error);

sect('Les membres d’un environnement, depuis la console');
// ⚠️ Il fallait ENTRER chez le client pour changer un grade : un
// aller-retour par geste, et une trace qui disait « fait depuis
// l'intérieur », comme si le client l'avait fait lui-même.
const espMb = await J('/api/platform/spaces',{method:'POST',body:JSON.stringify(
  {nom:'Client Membres',guildId:'555000555',staffRoleId:'900055',formule:'illimite'})},patron);
const SM = espMb.body.id;
const mUrl = '/api/platform/spaces/' + SM + '/membres';
const vide = await J(mUrl,{},patron);
t('un environnement neuf n’a aucun membre', (vide.body.membres||[]).length===0);
t('mais il a déjà ses grades', (vide.body.roles||[]).length > 0,
  (vide.body.roles||[]).map(r=>r.label).slice(0,3).join(', '));
t('et il dit combien de sièges l’offre laisse',
  vide.body.sieges && vide.body.sieges.offre==='Illimité' && vide.body.sieges.max===null);

const parDc = await J(mUrl,{method:'POST',body:JSON.stringify(
  {pseudo:'PatronMb', discordId:'338271640518273111', role:'fondateur'})},patron);
t('on crée un membre par identifiant Discord', parDc.status===200, parDc.body && parDc.body.error);
const parMdp = await J(mUrl,{method:'POST',body:JSON.stringify(
  {pseudo:'SecoursMb', password:'motdepassesecours1', role:'moderateur'})},patron);
t('ou par mot de passe, pour un compte de secours', parMdp.status===200);
const sansRien = await J(mUrl,{method:'POST',body:JSON.stringify({pseudo:'Fantome', role:'helper'})},patron);
t('⚠️ mais pas SANS l’un ni l’autre — ce serait une ligne dans la liste et personne derrière',
  sansRien.status===400, sansRien.body && sansRien.body.error);
const dcFaux = await J(mUrl,{method:'POST',body:JSON.stringify(
  {pseudo:'Bancal', discordId:'nyx', role:'helper'})},patron);
t('un identifiant Discord qui n’en est pas est refusé', dcFaux.status===400);
const doublon = await J(mUrl,{method:'POST',body:JSON.stringify(
  {pseudo:'PatronMb', password:'motdepassedouble12', role:'helper'})},patron);
t('deux fois le même pseudo dans un environnement : refusé', doublon.status===409);
// ⚠️ UN COMPTE DISCORD N'A PAS DE MOT DE PASSE, et la colonne ne peut
// pas rester vide : on y pose un marqueur qui n'est pas un hachage.
// Encore faut-il qu'il ne se saisisse pas — sinon le marqueur SERAIT le
// mot de passe, le même pour tous les comptes Discord du produit.
for (const essai of ['discord', '', 'Discord'])
  t(`⚠️ « ${essai || '(vide)'} » n’ouvre pas le compte Discord de PatronMb`,
    (await fetch(B+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({pseudo:'PatronMb',password:essai})})).status !== 200);

let lst = (await J(mUrl,{},patron)).body;
const patronMb = lst.membres.find(x=>x.pseudo==='PatronMb');
const secours  = lst.membres.find(x=>x.pseudo==='SecoursMb');
t('les deux sont là, avec leur grade',
  patronMb.roleKeys.includes('fondateur') && secours.roleKeys.includes('moderateur'),
  lst.membres.map(m=>m.pseudo+':'+m.roleKeys.join('+')).join(', '));

const grade = await J(mUrl+'/'+secours.id,{method:'PATCH',body:JSON.stringify({roles:['helper']})},patron);
t('on change un grade depuis la console', grade.status===200);
lst = (await J(mUrl,{},patron)).body;
t('et le changement tient', lst.membres.find(x=>x.id===secours.id).roleKeys.includes('helper'));
const inconnu = await J(mUrl+'/'+secours.id,{method:'PATCH',body:JSON.stringify({roles:['roi']})},patron);
t('⚠️ un grade qui n’existe pas dans CET environnement est refusé', inconnu.status===400);

await J(mUrl+'/'+patronMb.id,{method:'PATCH',body:JSON.stringify({proprietaire:true})},patron);
lst = (await J(mUrl,{},patron)).body;
t('on désigne le propriétaire', lst.proprietaire===patronMb.id
  && lst.membres.find(x=>x.id===patronMb.id).proprietaire===true);
const retraitProprio = await J(mUrl+'/'+patronMb.id,{method:'DELETE'},patron);
t('⚠️ et on ne le retire pas sans le remplacer — sinon plus personne ne peut nommer un fondateur',
  retraitProprio.status===409, retraitProprio.body && retraitProprio.body.error);

const retrait = await J(mUrl+'/'+secours.id,{method:'DELETE'},patron);
t('on retire un membre ordinaire', retrait.status===200);
lst = (await J(mUrl,{},patron)).body;
t('il quitte la liste', !lst.membres.some(x=>x.id===secours.id), lst.membres.length+' restant(s)');
t('mais ce qu’il a fait reste au journal',
  ((await J('/api/platform/journal?q=SecoursMb',{},patron)).body.entrees||[]).length > 0);

sect('Reprendre un compte existant, c’est le DÉPLACER');
// ⚠️ Un compte n'appartient qu'à un environnement. Fabriquer un doublon
// aurait donné deux comptes partageant un mot de passe, qui divergent
// le lendemain.
const ailleurs = (await J(mUrl,{},patron)).body.ailleurs || [];
t('la console propose les comptes des autres environnements', ailleurs.length > 0,
  ailleurs.length+' candidat(s)');
t('et dit de quel environnement ils viennent', ailleurs.every(x=>x.espace !== undefined));
const venu = ailleurs.find(x=>x.pseudo!=='PatronMb');
const bouge = await J(mUrl,{method:'POST',body:JSON.stringify(
  {depuis: venu.id, role:'moderateur'})},patron);
t('on en déplace un ici', bouge.status===200 && bouge.body.deplace===true, bouge.body && bouge.body.error);
lst = (await J(mUrl,{},patron)).body;
t('il arrive avec le grade choisi, pas avec ceux d’avant',
  (lst.membres.find(x=>x.id===venu.id)||{}).roleKeys.join()==='moderateur');
const rebelote = await J(mUrl,{method:'POST',body:JSON.stringify({depuis: venu.id, role:'helper'})},patron);
t('le redéplacer ici ne veut rien dire : refusé', rebelote.status===409);

sect('Entrer chez un client, c’est y entrer en FONDATEUR');
// ⚠️ Quel que soit son grade dans l'équipe de la plateforme : un support
// qui dépanne doit tout pouvoir dans l'environnement où il entre, sinon
// il redemande l'accès au client à chaque intervention. C'est
// `plat.entrer` qui décide s'il peut entrer ; dedans, pas de demi-mesure.
await J('/api/platform/enter',{method:'POST',body:JSON.stringify({spaceId:SM})},patron);
const dedans = await J('/api/auth/me',{},patron);
t('tous les droits du panneau', (dedans.body.perms||[]).includes('actions.ban')
  && (dedans.body.perms||[]).includes('roles.manage'),
  (dedans.body.perms||[]).length+' droit(s)');
t('toutes les rubriques, sans être borné par l’offre du client',
  (dedans.body.cats||[]).length >= 18, (dedans.body.cats||[]).length+' rubrique(s)');
t('⚠️ et l’ÉTIQUETTE ne ment plus : elle dit Fondateur, pas le grade d’un autre environnement',
  /Fondateur/.test(dedans.body.staff.roleLabel||''), dedans.body.staff.roleLabel);
t('le libellé dit aussi d’où vient ce pouvoir',
  /Origin Logs/.test(dedans.body.staff.roleLabel||''), dedans.body.staff.roleLabel);
await J('/api/platform/enter',{method:'POST',body:JSON.stringify({spaceId:0})},patron);

sect('Le journal d’UNE personne');
// ⚠️ « Qui a fermé cet espace ? » ne se lit pas en parcourant tout le
// journal. Le filtre porte sur l'IDENTIFIANT : deux espaces peuvent
// chacun avoir leur « Nyx », et un filtre textuel aurait attribué à
// l'un les gestes de l'autre.
const moiPlat = ((await J("/api/platform/members",{},patron)).body.members||[]).find(x=>x.pseudo==="Sup");
const mien = await J('/api/platform/journal?membre='+moiPlat.id,{},patron);
t('le journal se filtre par personne', mien.status===200);
t('et ne rend que ses actions à elle',
  (mien.body.entrees||[]).length > 0
  && (mien.body.entrees||[]).every(e => e.pseudo === 'Sup'),
  (mien.body.entrees||[]).length + ' entrée(s)');
const autrui = await J('/api/platform/journal?membre='+v.id,{},patron);
t('⚠️ et le journal de quelqu’un d’autre ne contient pas les miennes',
  (autrui.body.entrees||[]).every(e => e.pseudo !== 'Sup'),
  (autrui.body.entrees||[]).length + ' entrée(s)');
t('un identifiant qui n’existe pas ne rend rien plutôt que TOUT',
  ((await J('/api/platform/journal?membre=999999',{},patron)).body.entrees||[]).length===0);

sect('Le dernier administrateur ne se retire pas');
// ⚠️ Se retirer de l'équipe ferme sa propre session sur-le-champ : c'est
// voulu, mais cela veut dire qu'il n'y a pas de retour en arrière. D'où
// le garde-fou sur le DERNIER.
const idSup = (liste.body.members||[]).find(x=>x.pseudo==='Sup').id;
for (const autre of [v.id, cur.id])
  await J('/api/platform/members/'+autre,{method:'PATCH',body:JSON.stringify({platform:false})},patron);
const restants = ((await J('/api/platform/members',{},patron)).body.members||[]).filter(x=>x.platform);
t('il ne reste qu’une personne dans l’équipe', restants.length===1, restants.map(x=>x.pseudo).join(', '));
const seul = await J('/api/platform/members/'+idSup,{method:'PATCH',
  body:JSON.stringify({platform:false})},patron);
t('⚠️ et elle ne peut pas se retirer — sinon plus personne n’administre rien',
  seul.status===409, seul.status + ' ' + ((seul.body||{}).error||''));

const ko=T.filter(x=>!x[0]);
console.log('\n  '+(T.length-ko.length)+'/'+T.length+' contrôles passés');
if (ko.length) { console.log('\n  Échecs :'); ko.forEach(x=>console.log('   · '+x[1])); process.exit(1); }
