// Présence, comptes liés, notes d'équipe, statistiques et relais du bot.
const B = process.env.BASE, KEY = process.env.KEY;
const T=[];const t=(n,ok,x='')=>{T.push([ok,n]);console.log((ok?'  ok    ':'  ÉCHEC ')+n+(x?'  → '+x:''));};
const sect=n=>console.log('\n── '+n+' '+'─'.repeat(Math.max(0,54-n.length)));
let ck='';
const J=async(p,o={},c)=>{const r=await fetch(B+p,{redirect:'manual',...o,headers:{'content-type':'application/json',cookie:c!==undefined?c:ck,...(o.headers||{})}});
  return {status:r.status, body:await r.json().catch(()=>null), r};};
const jeu=(p,corps,cle)=>fetch(B+p,{method:'POST',headers:{'content-type':'application/json','x-origin-key':cle||KEY},body:JSON.stringify(corps)});

const r0 = await fetch(B+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({pseudo:'Nyx',password:'motdepassetest123'})});
ck = (r0.headers.get('set-cookie')||'').split(';')[0];

sect('Présence — la photo, pas le journal');
let o = await J('/api/online');
t('⚠️ sans battement, la liste est INCONNUE, pas vide', o.body.battement===null && o.body.frais===false,
  'battement='+o.body.battement);
await jeu('/api/presence',{joueurs:[
  {key:'license:p1',name:'Luca',sid:12,job:'Mécano',ping:38},
  {key:'license:p2',name:'Mia',sid:44,job:'LSPD',ping:52},
  {key:'license:st1',name:'NyxEnJeu',sid:2,ping:20,discord:'discord:777000111222333444'}]});
o = await J('/api/online');
t('le battement remplit la liste', o.body.total===3, o.body.total+' en ligne');
t('et elle est déclarée fraîche', o.body.frais===true);
t('⚠️ le staff est reconnu par son DISCORD, pas par son nom',
  o.body.staff.length===1 && o.body.staff[0].staffPseudo==='Nyx', JSON.stringify(o.body.staff.map(x=>x.nom+'→'+x.staffPseudo)));
t('les joueurs sont à part', o.body.joueurs.length===2);

// Un départ : la liste suivante ne le contient plus.
await jeu('/api/presence',{joueurs:[{key:'license:p1',name:'Luca',sid:12,ping:40}]});
o = await J('/api/online');
t('⚠️ ce qui n’est plus dans la liste EST PARTI — aucun évènement de départ requis',
  o.body.total===1 && o.body.joueurs[0].nom==='Luca', o.body.total+' restant(s)');
// ⚠️ Le vrai piège : un serveur qui redémarre n'émet aucun « playerDropped ».
await jeu('/api/presence',{joueurs:[]});
o = await J('/api/online');
t('⚠️ un serveur vidé se vide vraiment (le cas du redémarrage)', o.body.total===0);

await jeu('/api/presence',{joueurs:[
  {key:'license:p1',name:'Luca Ferraro',sid:12,job:'Mécano',ping:38},
  {key:'license:p9',name:'LucaBis',sid:90,ping:150}]});
o = await J('/api/online?q=' + encodeURIComponent('Luca'));
t('la recherche filtre', (o.body.joueurs||[]).length===2 && o.body.total===2);
o = await J('/api/online?q=' + encodeURIComponent('90'));
t('et porte aussi sur l’ID serveur', (o.body.joueurs||[]).length===1, (o.body.joueurs[0]||{}).nom);

sect('Comptes liés');
await jeu('/api/ingest',{events:[
  {cat:'connexions',sev:'info',msg:'Luca Ferraro a rejoint',actor:{key:'license:p1',name:'Luca Ferraro',sid:12,steam:'steam:110000100AAA',discord:'discord:555'}},
  {cat:'connexions',sev:'info',msg:'LucaBis a rejoint',actor:{key:'license:p9',name:'LucaBis',sid:90,steam:'steam:110000100AAA'}},
  {cat:'connexions',sev:'info',msg:'Mia a rejoint',actor:{key:'license:p2',name:'Mia',sid:44,steam:'steam:110000100BBB'}},
  {cat:'bans',sev:'critique',msg:'Nyx a banni LucaBis',actor:{key:'license:st1',name:'Nyx',sid:2},
   target:{key:'license:p9',name:'LucaBis'},
   data:{kind:'ban',type:'ban',cible:'LucaBis',cibleKey:'license:p9',motif:'Cheat',staff:'Nyx'}}]});
const f = await J('/api/players/' + encodeURIComponent('license:p1'));
const liens = f.body.liens || [];
t('⚠️ le double compte est TROUVÉ', liens.length===1 && liens[0].nom==='LucaBis', liens.length+' lien(s)');
t('et le MOTIF du rapprochement est dit — un lien n’est pas une preuve',
  liens[0] && liens[0].motifs.includes('même Steam'), liens[0] && liens[0].motifs.join(', '));
t('⚠️ et qu’il est BANNI, ce qui change la décision', liens[0] && liens[0].banni===true, liens[0] && liens[0].banMotif);
const f2 = await J('/api/players/' + encodeURIComponent('license:p2'));
t('un joueur sans double compte n’en invente pas', (f2.body.liens||[]).length===0);

sect('Notes d’équipe');
const n1 = await J('/api/notes/' + encodeURIComponent('license:p1'), {method:'POST',
  body:JSON.stringify({texte:'Déjà repris deux fois pour RDM. Prochaine = ban.'})});
t('on écrit une note', n1.body.ok===true);
const nl = await J('/api/notes/' + encodeURIComponent('license:p1'));
t('elle est signée et datée', nl.body.notes[0].par==='Nyx' && nl.body.notes[0].le>0);
t('et elle suit la fiche du joueur',
  ((await J('/api/players/' + encodeURIComponent('license:p1'))).body.notes||[]).length===1);
t('une note vide est refusée',
  (await J('/api/notes/' + encodeURIComponent('license:p1'), {method:'POST',body:JSON.stringify({texte:' '})})).status===400);

sect('Statistiques d’équipe');
await jeu('/api/ingest',{events:[
  {cat:'reports',sev:'info',msg:'Nyx a pris le report de Luca',actor:{key:'license:st1',name:'Nyx',sid:2,staff:true},
   target:{key:'license:p1',name:'Luca Ferraro'},data:{kind:'prise',attenteAvantPrise:'6 min'}},
  {cat:'reports',sev:'info',msg:'Nyx a clos le report de Luca',actor:{key:'license:st1',name:'Nyx',sid:2,staff:true},
   target:{key:'license:p1',name:'Luca Ferraro'},data:{kind:'cloture'}},
  {cat:'reports',sev:'alerte',msg:'Report de Mia sans reponse',actor:{key:'license:p2',name:'Mia',sid:44},
   data:{kind:'sans_reponse'}}]});
const st = await J('/api/team/stats?jours=7');
const nyx = (st.body.equipe||[]).find(m=>m.pseudo==='Nyx');
t('chaque membre a ses chiffres', !!nyx && nyx.reportsPris===1 && nyx.reportsClos===1,
  nyx && `pris ${nyx.reportsPris}, clos ${nyx.reportsClos}`);
t('l’attente avant prise est mesurée', nyx && nyx.attenteMoyenne===6, nyx && nyx.attenteMoyenne+' min');
t('les sanctions comptent', nyx && nyx.sanctions>=1, nyx && String(nyx.sanctions));
t('⚠️ « SANS RÉPONSE » est compté À PART — il n’est imputable à personne',
  st.body.total.sansReponse===1, String(st.body.total.sansReponse));
t('la période se règle', (await J('/api/team/stats?jours=1')).body.jours===1);
t('une période absurde est ramenée dans les bornes', (await J('/api/team/stats?jours=9999')).body.jours===90);

sect('Le relais du bot');
const kb = await fetch(B+'/api/relay/hello',{headers:{'x-origin-relay':'relais-de-test-0123456789abcd'}});
const hello = await kb.json();
t('le bot apprend le catalogue', kb.status===200 && hello.rubriques.length===18, hello.rubriques&&hello.rubriques.length+' rubriques');
t('⚠️ et le dernier id — pour ne PAS rejouer l’historique', hello.dernierId>0, '#'+hello.dernierId);
const ev = await (await fetch(B+'/api/relay/events?since=0&limit=5',{headers:{'x-origin-relay':'relais-de-test-0123456789abcd'}})).json();
t('il lit les évènements', (ev.evenements||[]).length===5);
t('⚠️ AUCUNE LICENCE ne sort par le relais — un salon Discord se lit à plusieurs',
  !JSON.stringify(ev).includes('license:'), JSON.stringify(ev).includes('license:')?'FUITE':'aliasées');
t('les acteurs portent un alias stable', (ev.evenements[0].acteur.ref||'').startsWith('k:'));
t('⚠️ la clé du JEU n’ouvre pas le relais',
  (await fetch(B+'/api/relay/hello',{headers:{'x-origin-relay':KEY}})).status===401);
t('⚠️ et le relais ne sait QUE lire',
  (await fetch(B+'/api/relay/events',{method:'POST',headers:{'x-origin-relay':'relais-de-test-0123456789abcd'}})).status===405);
t('une session de staff ne suffit pas non plus',
  (await J('/api/relay/hello')).status===401);

sect('Réservé à qui en a le droit');
const r1 = await fetch(B+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({pseudo:'Kaleb',password:'motdepassetest456'})});
const ck2 = (r1.headers.get('set-cookie')||'').split(';')[0];
t('⚠️ un modérateur ne voit PAS la vue d’équipe', (await J('/api/team/stats',{},ck2)).status===403);
t('mais il écrit une note (c’est son métier)',
  (await J('/api/notes/' + encodeURIComponent('license:p1'), {method:'POST',
    body:JSON.stringify({texte:'Vu en jeu, comportement correct ce soir.'})},ck2)).body.ok===true);
t('il voit qui est en ligne', (await J('/api/online',{},ck2)).status===200);

const n=T.filter(([o])=>o).length;
console.log(`\n  ${n}/${T.length} contrôles passés`);
process.exit(n===T.length?0:1);
