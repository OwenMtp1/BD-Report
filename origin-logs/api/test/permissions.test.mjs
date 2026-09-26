// PERMISSIONS FINES — chaque geste a son droit.
// ⚠️ Les anciens fourre-tout « gérer les comptes » et « RGPD » ont été
// éclatés. On vérifie ici qu'un rôle qui a l'un des droits fins n'a PAS
// automatiquement les autres : créer un compte n'autorise pas à le
// supprimer, exporter des données n'autorise pas à les effacer.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const CAT = require('../catalogue.js');

const B = process.env.BASE;
const T=[];const t=(n,ok,x='')=>{T.push([ok,n]);console.log((ok?'  ok    ':'  ÉCHEC ')+n+(x?'  → '+x:''));};
const sect=n=>console.log('\n── '+n+' '+'─'.repeat(Math.max(0,54-n.length)));
const J=async(p,o={},c)=>{const r=await fetch(B+p,{redirect:'manual',...o,
  headers:{'content-type':'application/json',...(c!==undefined?{cookie:c}:{}),...(o.headers||{})}});
  return {status:r.status, body:await r.json().catch(()=>null)};};
const login=async(pseudo,mdp)=>{const r=await fetch(B+'/api/auth/login',{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({pseudo,password:mdp})});
  return (r.headers.get('set-cookie')||'').split(';')[0];};

const chef = await login('Nyx','motdepassetest123');   // fondateur : a tout

sect('Le catalogue est bien éclaté');
const cat = await J('/api/catalogue',{},chef);
const ids = cat.body.perms.map(p=>p.id);
t('les droits de compte sont détaillés',
  ['accounts.view','accounts.create','accounts.role','accounts.password','accounts.disable','accounts.remove'].every(x=>ids.includes(x)));
t('l’export et l’effacement RGPD sont séparés',
  ids.includes('players.export') && ids.includes('players.erase') && !ids.includes('players.gdpr'));
t('« tout gérer » n’existe plus', !ids.includes('accounts.manage'));
t('les droits sont groupés pour l’écran', (cat.body.permGroups||[]).length>=5
  && cat.body.perms.every(p=>p.group));

sect('Un rôle « créer sans supprimer »');
// Créer + voir, mais NI suppression NI mot de passe NI suspension.
const rCrea = await J('/api/roles',{method:'POST',body:JSON.stringify({
  label:'Recruteur', rank:55, cats:['bans'],
  perms:['logs.view','accounts.view','accounts.create'] })},chef);
t('rôle créé', rCrea.status===200 && rCrea.body.key, JSON.stringify(rCrea.body));
await J('/api/staff',{method:'POST',body:JSON.stringify({pseudo:'Recruteur1',password:'motdepasserec123',role:rCrea.body.key})},chef);
// Une cible à essayer de supprimer : un compte de rang inférieur.
await J('/api/staff',{method:'POST',body:JSON.stringify({pseudo:'Bleu',password:'motdepassebleu123',role:'helper'})},chef);
const rec = await login('Recruteur1','motdepasserec123');
const equipe = await J('/api/staff',{},rec);
t('il voit l’équipe (accounts.view)', equipe.status===200);
const cible = (equipe.body.staff||[]).find(x=>x.pseudo==='Bleu');
t('il crée un compte (accounts.create)',
  (await J('/api/staff',{method:'POST',body:JSON.stringify({pseudo:'Nouveau',password:'motdepassenouv123',role:'helper'})},rec)).status===200);
t('⚠️ il NE supprime PAS (accounts.remove manquant)',
  (await J('/api/staff/'+cible.id,{method:'DELETE'},rec)).status===403);
t('⚠️ il NE réinitialise PAS un mot de passe (accounts.password)',
  (await J('/api/staff/'+cible.id,{method:'PATCH',body:JSON.stringify({password:'motdepasseforce123'})},rec)).status===403);
t('⚠️ il NE suspend PAS un compte (accounts.disable)',
  (await J('/api/staff/'+cible.id,{method:'PATCH',body:JSON.stringify({disabled:true})},rec)).status===403);

sect('Un rôle « effacer mais pas exporter » et l’inverse');
const rEff = await J('/api/roles',{method:'POST',body:JSON.stringify({
  label:'Effaceur', rank:54, cats:['bans'], perms:['logs.view','players.view','players.erase'] })},chef);
await J('/api/staff',{method:'POST',body:JSON.stringify({pseudo:'Effaceur1',password:'motdepasseeff1234',role:rEff.body.key})},chef);
const eff = await login('Effaceur1','motdepasseeff1234');
t('⚠️ il n’EXPORTE pas (players.export manquant → 403)',
  (await J('/api/rgpd/'+encodeURIComponent('license:inconnu'),{},eff)).status===403);
// L'effacement, lui, PASSE le contrôle de droit : le refus ne serait plus
// une question de permission (403), mais au pire de cible absente.
const effDel = await J('/api/rgpd/'+encodeURIComponent('license:inconnu'),{method:'DELETE',body:'{}'},eff);
t('l’effacement passe le contrôle de droit (pas de 403)', effDel.status!==403, 'status '+effDel.status);

const rExp = await J('/api/roles',{method:'POST',body:JSON.stringify({
  label:'Exporteur', rank:53, cats:['bans'], perms:['logs.view','players.view','players.export'] })},chef);
await J('/api/staff',{method:'POST',body:JSON.stringify({pseudo:'Exporteur1',password:'motdepasseexp1234',role:rExp.body.key})},chef);
const exp = await login('Exporteur1','motdepasseexp1234');
t('⚠️ lui exporte (players.export) mais n’efface pas (players.erase)',
  (await J('/api/rgpd/'+encodeURIComponent('license:inconnu'),{method:'DELETE',body:'{}'},exp)).status===403);

sect('La passerelle des anciens droits');
t('accounts.manage se déplie en 6 droits fins',
  CAT.expandAliasPerms(['accounts.manage']).length===6
  && CAT.expandAliasPerms(['accounts.manage']).includes('accounts.remove'));
t('players.gdpr se déplie en export + effacement',
  CAT.expandAliasPerms(['players.gdpr']).sort().join(',')==='players.erase,players.export');
t('un droit déjà fin reste intact', CAT.expandAliasPerms(['logs.view']).join(',')==='logs.view');

const n=T.filter(([o])=>o).length;
console.log(`\n  ${n}/${T.length} contrôles passés`);
process.exit(n===T.length?0:1);
