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

sect('Un bot Discord PAR ESPACE');
let b0 = await J('/api/discord/bot');
t('au départ, aucun bot', b0.body.enPlace === false);
t('⚠️ le serveur Discord est HÉRITÉ de la liaison — on ne le redemande pas',
  b0.body.guildeHeritee === true || b0.body.guilde === '', 'guilde=' + b0.body.guilde);
const JETON = 'MTk4NjIyNDgzNDcxOTI1MjQ4.faux.jeton-de-controle-pour-lessai-0123';
t('un jeton trop court est refusé',
  (await J('/api/discord/bot', {method:'POST', body:JSON.stringify({jeton:'trop-court'})})).status === 400);
t('le client branche son bot depuis SON panneau',
  (await J('/api/discord/bot', {method:'POST', body:JSON.stringify({
     jeton: JETON, guilde: '123456789012345678',
     options: { rolePing:'987654321098765432', pingSur:['critique'], maxParSalon: 5 } })})).body.ok === true);
b0 = await J('/api/discord/bot');
t('il est en place', b0.body.enPlace === true);
t('⚠️ et le JETON ne redescend JAMAIS au navigateur',
  !JSON.stringify(b0.body).includes('faux') && !JSON.stringify(b0.body).includes('jeton-de-controle'),
  JSON.stringify(b0.body).includes('faux') ? 'FUITE' : 'jamais rendu');
t('les réglages sont gardés', b0.body.options.maxParSalon === 5 && b0.body.options.rolePing === '987654321098765432');
t('⚠️ un réglage aberrant est ramené dans les bornes',
  (await J('/api/discord/bot', {method:'POST', body:JSON.stringify({options:{maxParSalon: 9999, rolePing:'pasunid'}})}))
    .body.ok === true &&
  (await J('/api/discord/bot')).body.options.maxParSalon === 50 &&
  (await J('/api/discord/bot')).body.options.rolePing === '');
t('⚠️ la clé de LECTURE est délivrée avec le bot — pas une pièce à réclamer',
  (await J('/api/discord/bot')).body.relaisPret === true);
t('un champ vide GARDE le jeton en place — on ne l’efface pas par distraction',
  (await J('/api/discord/bot', {method:'POST', body:JSON.stringify({guilde:'123456789012345678'})})).body.ok === true
  && (await J('/api/discord/bot')).body.enPlace === true);

sect('L’inventaire, pour un seul processus');
const INV = h => fetch(B + '/api/relay/spaces', { headers: h }).then(async r => ({ status:r.status, body: await r.json().catch(()=>null) }));
t('⚠️ sans la clé de l’éditeur, la route refuse', (await INV({})).status === 401);
t('la clé d’un CLIENT ne l’ouvre pas non plus',
  (await INV({ 'x-origin-relay': 'relais-de-test-0123456789abcd' })).status === 401);
const inv = await INV({ 'x-origin-bot': 'cle-du-bot-de-test-0123456789' });
t('avec la clé de l’éditeur, l’espace apparaît', inv.status === 200 && inv.body.espaces.length === 1,
  (inv.body.espaces || []).map(x => x.nom).join(', '));
const e0 = (inv.body.espaces || [])[0] || {};
t('⚠️ il porte les DEUX clés : lire le panneau, écrire dans Discord',
  !!e0.relais && !!e0.jeton && e0.relais !== e0.jeton);
t('et ses réglages, tels que le client les a posés', e0.options && e0.options.maxParSalon === 50);
t('retirer le bot le retire de l’inventaire',
  (await J('/api/discord/bot', {method:'POST', body:JSON.stringify({jeton:''})})).body.ok === true
  && (await INV({ 'x-origin-bot': 'cle-du-bot-de-test-0123456789' })).body.espaces.length === 0);
t('⚠️ mais la clé de LECTURE, elle, reste — retirer le bot ne coupe pas les journaux',
  (await J('/api/discord/bot')).body.relaisPret === true);

sect('Réservé à qui en a le droit');
const r1 = await fetch(B+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({pseudo:'Kaleb',password:'motdepassetest456'})});
const ck2 = (r1.headers.get('set-cookie')||'').split(';')[0];
t('⚠️ un modérateur ne voit PAS la vue d’équipe', (await J('/api/team/stats',{},ck2)).status===403);
t('mais il écrit une note (c’est son métier)',
  (await J('/api/notes/' + encodeURIComponent('license:p1'), {method:'POST',
    body:JSON.stringify({texte:'Vu en jeu, comportement correct ce soir.'})},ck2)).body.ok===true);
t('il voit qui est en ligne', (await J('/api/online',{},ck2)).status===200);
t('⚠️ un modérateur ne branche PAS le bot Discord de l’espace',
  (await J('/api/discord/bot',{method:'POST',body:JSON.stringify({jeton:JETON})},ck2)).status===403);

const n=T.filter(([o])=>o).length;
console.log(`\n  ${n}/${T.length} contrôles passés`);
process.exit(n===T.length?0:1);
