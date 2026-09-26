// Niveaux 1 et 2 : l'inventaire du serveur de jeu, et le scan de son code.
// ⚠️ Deux garanties portent tout le reste : le CODE du client ne remonte
// jamais, et rien ne se branche sans qu'un humain l'ait coché.
import { readFileSync } from 'node:fs';
const B = process.env.BASE;
const T=[];const t=(n,ok,x='')=>{T.push([ok,n]);console.log((ok?'  ok    ':'  ÉCHEC ')+n+(x?'  → '+x:''));};
const sect=n=>console.log('\n── '+n+' '+'─'.repeat(Math.max(0,54-n.length)));
let ck='';
const J=async(p,o={},c)=>{const r=await fetch(B+p,{redirect:'manual',...o,headers:{'content-type':'application/json',cookie:c!==undefined?c:ck,...(o.headers||{})}});
  return {status:r.status, body:await r.json().catch(()=>null), r};};
const login=async(pseudo,mdp)=>{const r=await fetch(B+'/api/auth/login',{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({pseudo,password:mdp})});
  return (r.headers.get('set-cookie')||'').split(';')[0];};
const poster=(chemin,cle,corps)=>fetch(B+chemin,{method:'POST',
  headers:{'content-type':'application/json','x-origin-key':cle},body:JSON.stringify(corps)});

const ECO = await import('../ecosysteme.js');

sect('⚠️ On compare des MOTS, pas des morceaux de mots');
// Le premier jet cherchait le mot-clé n'importe où : « draw » (bruit
// d'affichage) reconnaissait « withdraw », et l'évènement de retrait
// bancaire — celui qu'on veut — partait à la poubelle.
t('« withdraw » n’est pas du bruit à cause de « draw »', ECO.estBruit('banking:server:withdraw')===false);
t('mais « hud:update » en est', ECO.estBruit('hud:update')===true);
t('et « playerHudTick » aussi, casse mélangée comprise', ECO.estBruit('playerHudTick')===true);
t('⚠️ « cle » ne reconnaît pas « oracle »', ECO.deviner('oracle:query')===null);
t('⚠️ ni « tp » n’importe quel mot qui commence par t', ECO.deviner('truc:machin')===null);
t('un préfixe suffit à partir de 4 lettres', (ECO.deviner('shop:buyItem')||{}).cat==='inventaire'
  || (ECO.deviner('shop:buyItem')||{}).cat==='boutique_produits', JSON.stringify(ECO.deviner('shop:buyItem')));
for (const [ev, cat] of [['renewed-banking:server:withdraw','boutique_caisse'],
                         ['qb-garages:server:takeOut','proprietes'],
                         ['police:server:ban','bans'],
                         ['ems:server:facture','facture_ems']]) {
  const d = ECO.deviner(ev);
  t(`« ${ev} » → ${cat}`, d && d.cat===cat, d ? d.cat : 'aucun');
}

sect('⚠️ Le fichier généré n’ouvre JAMAIS un évènement aux joueurs');
const lua = ECO.lua([{ev:'banque:retirer',cat:'boutique_caisse',ressource:'ma_banque'},
                     {ev:'banque:retirer',cat:'boutique_caisse',ressource:'ma_banque'},
                     {ev:"mechant'); os.exit(); --",cat:'admin',ressource:'x'},
                     {ev:'truc:bidule',cat:'rubrique_inventee',ressource:'y'}], 'Client');
t('⚠️ aucun RegisterNetEvent — sinon les joueurs pourraient déclencher l’évènement d’origine',
  !/^\s*RegisterNetEvent\s*\(/m.test(lua));   // l’en-tête a le droit d’en PARLER
t('seulement des écouteurs', /AddEventHandler\('banque:retirer'/.test(lua));
t('un évènement choisi deux fois n’est branché qu’une', (lua.match(/^AddEventHandler\('/gm)||[]).length===2,
  (lua.match(/^AddEventHandler\('/gm)||[]).length+' handlers');
t('⚠️ un nom d’évènement biscornu est REFUSÉ, pas échappé', !lua.includes('os.exit'));
t('une rubrique inventée retombe sur « admin »', /cat = 'admin'/.test(lua));
t('et il dit où le déposer', lua.includes('server/sur_mesure/'));

sect('Niveau 1 — l’inventaire');
ck = await login('Sup','motdepassesup12345');
const sp = await J('/api/platform/spaces',{method:'POST',body:JSON.stringify(
  {nom:'Client Integration',guildId:'555001111',staffRoleId:'900011'})});
const ID = sp.body.id, CLE = sp.body.cle;

const vide = await J('/api/platform/spaces/'+ID+'/integration');
t('avant toute remontée, l’écran le dit', vide.status===200 && vide.body.quand===null);

const inv = await poster('/api/inventory', CLE, { framework:'qb', ressources:[
  {nom:'qb-core',etat:'started',version:'1.0'},
  {nom:'ox_inventory',etat:'started'},
  {nom:'baseevents',etat:'started'},
  {nom:'Renewed-Banking',etat:'started'},
  {nom:'mon_braquage',etat:'started'},
  {nom:'vieux_truc',etat:'stopped'}
]});
t('la ressource dépose son inventaire', inv.status===200);
const a1 = (await J('/api/platform/spaces/'+ID+'/integration')).body;
t('le framework remonte', a1.framework==='qb', a1.framework);
t('6 ressources vues', a1.total===6, String(a1.total));
const branches = a1.natives.filter(n=>n.etat==='branche').map(n=>n.id);
t('qb-core, ox_inventory et baseevents sont « branchés »',
  ['qb-core','ox_inventory','baseevents'].every(x=>branches.includes(x))
  && !branches.includes('es_extended'), branches.join(','));
t('⚠️ screenshot-basic manque, et l’écran dira pourquoi c’est gênant',
  a1.natives.some(n=>n.id==='screenshot-basic' && n.etat==='absente' && n.sans));
t('Renewed-Banking est connue mais pas branchée',
  a1.connues.some(c=>c.id==='Renewed-Banking' && c.cat==='boutique_caisse'));
t('et mon_braquage tombe dans les inconnues', a1.inconnues.some(r=>r.nom==='mon_braquage'));
// ⚠️ Les gestes sur les joueurs qui DÉPENDENT d'une ressource sont repérés
// dans l'inventaire déjà reçu : ox_inventory est là → « Voir l'inventaire »
// est prêt ; aucun métier ambulancier → « Réanimer » reste à confirmer.
const invCap = a1.capacites.find(c=>c.geste==='inventaire');
t('l’inventaire est détecté sur ox_inventory', invCap && invCap.ressource==='ox_inventory', JSON.stringify(invCap));
const reaCap = a1.capacites.find(c=>c.geste==='reanimation');
t('la réanimation reste à confirmer sans métier ambulancier',
  reaCap && reaCap.ressource===null && reaCap.candidats.includes('esx_ambulancejob'), JSON.stringify(reaCap));
t('les gestes universels sont annoncés', Array.isArray(a1.gestesUniversels)
  && a1.gestesUniversels.includes('Soigner') && a1.gestesUniversels.includes('Geler / dégeler'),
  JSON.stringify(a1.gestesUniversels));
t('une clé fausse ne dépose rien', (await poster('/api/inventory','pas-la-bonne',{ressources:[]})).status===401);

sect('Niveau 2 — le scan du code');
const sc = await poster('/api/scan', CLE, { lus: 42, protegees:['esx_menu_default'], ressources:[
  { nom:'mon_braquage', evenements:['braquage:server:payer','hud:update','truc:machin'],
    // ⚠️ Un champ de trop dans le corps : il ne doit JAMAIS être stocké.
    code:'if source then givemoney() end' },
  { nom:'Renewed-Banking', evenements:['renewed-banking:server:withdraw'] },
  { nom:'ox_inventory', evenements:['ox_inventory:server:swap'] }
]});
t('le scan est accepté', sc.status===200);
const a2 = (await J('/api/platform/spaces/'+ID+'/integration')).body;
t('les candidats sont proposés', a2.candidats.length>=2, a2.candidats.length+' candidats');
t('⚠️ la ressource connue impose SA rubrique, pas l’indice',
  a2.candidats.some(c=>c.ev==='renewed-banking:server:withdraw' && c.cat==='boutique_caisse' && c.sur==='catalogue'));
t('un évènement sur mesure est deviné',
  a2.candidats.some(c=>c.ev==='braquage:server:payer' && c.sur==='indice'), 
  JSON.stringify(a2.candidats.find(c=>c.ev==='braquage:server:payer')||null));
t('⚠️ le bruit est écarté AVANT d’être proposé',
  !a2.candidats.some(c=>c.ev==='hud:update') && a2.ecartes.bruit>=1);
t('ce qui n’évoque rien est écarté aussi', !a2.candidats.some(c=>c.ev==='truc:machin'));
t('⚠️ un évènement déjà couvert nativement n’est pas reproposé — sinon tout serait journalisé deux fois',
  !a2.candidats.some(c=>c.ressource==='ox_inventory') && a2.ecartes.natif>=1);
t('les ressources protégées sont nommées, pas oubliées', a2.protegees.includes('esx_menu_default'));
t('le catalogue le plus sûr remonte en premier', a2.candidats[0].sur==='catalogue');

sect('⚠️ Le code du client ne remonte jamais');
const brut = JSON.stringify(a2);
t('aucun bout de code dans ce qui est rendu', !brut.includes('givemoney'));
const SCAN_LUA = readFileSync(new URL('../../resource/server/scan.lua', import.meta.url), 'utf8');
t('⚠️ la ressource n’envoie que des noms', /ressources = ressources/.test(SCAN_LUA)
  && !/code = code/.test(SCAN_LUA) && !/contenu/.test(SCAN_LUA));
t('elle écarte les ressources protégées par escrow', SCAN_LUA.includes(".fxap"));
// ⚠️ Le scan lit TOUS les scripts serveur du client : il ne se déclenche
// pas dans le dos de l’administrateur. Le seul appel doit donc venir de
// la commande console, jamais d’un fil lancé au chargement.
t('⚠️ et RIEN ne part au démarrage : le scan est une commande console',
  SCAN_LUA.indexOf("RegisterCommand('origin_logs_scan'") > 0
  && SCAN_LUA.indexOf('Origin.Scanner(function') > SCAN_LUA.indexOf("RegisterCommand('origin_logs_scan'")
  && (SCAN_LUA.match(/Origin\.Scanner\(/g)||[]).length === 2);   // la définition, et l’appel depuis la commande
const INV_LUA = readFileSync(new URL('../../resource/server/inventaire.lua', import.meta.url), 'utf8');
t('l’inventaire, lui, part tout seul — il ne coûte rien', /Origin\.EnvoyerInventaire\(\)/.test(INV_LUA));
t('mais après les autres ressources, pas avant', /Wait\(15000\)/.test(INV_LUA));

sect('⚠️ Un scan RACCORDE, il ne propose pas');
// Tant qu'il fallait cocher puis déposer un fichier, le client repartait
// avec la moitié de ses rubriques vides : une liste de propositions est un
// travail de plus, pas un résultat.
t('les candidats sont posés d’office', (a2.raccordements||[]).length>=2,
  (a2.raccordements||[]).length+' raccordements');
t('et tous actifs', (a2.raccordements||[]).every(h=>h.active===true));
const hk = await fetch(B+'/api/hooks',{headers:{'x-origin-key':CLE}});
const hkb = await hk.json();
t('la ressource vient les chercher elle-même — aucun fichier à déposer',
  hk.status===200 && hkb.hooks.some(h=>h.ev==='renewed-banking:server:withdraw'));
t('chacun porte sa rubrique', hkb.hooks.every(h=>h.ev && h.cat));
t('⚠️ une clé fausse ne lit pas les raccordements d’un espace',
  (await fetch(B+'/api/hooks',{headers:{'x-origin-key':'pas-la-bonne'}})).status===401);

sect('Couper un raccordement, sans toucher au serveur de jeu');
const coupe = await J('/api/platform/spaces/'+ID+'/integration/hook',{method:'POST',
  body:JSON.stringify({ev:'braquage:server:payer',active:false})});
t('on le coupe depuis le panneau', coupe.status===200);
const hk2 = await (await fetch(B+'/api/hooks',{headers:{'x-origin-key':CLE}})).json();
t('la ressource ne le reçoit plus', !hk2.hooks.some(h=>h.ev==='braquage:server:payer'));
const a2b = (await J('/api/platform/spaces/'+ID+'/integration')).body;
t('⚠️ mais il RESTE listé, coupé — sinon le prochain scan le reproposerait',
  (a2b.raccordements||[]).some(h=>h.ev==='braquage:server:payer' && h.active===false));

const dep = await poster('/api/scan', CLE, { ressources:[
  { nom:'mon_braquage', evenements:['braquage:server:payer'] }] });
t('un second scan n’en repose pas', (await dep.json()).raccordements===0);
const a2c = (await J('/api/platform/spaces/'+ID+'/integration')).body;
t('⚠️ et ne ressuscite pas ce qu’on a refusé',
  (a2c.raccordements||[]).find(h=>h.ev==='braquage:server:payer').active===false);

const rub = await J('/api/platform/spaces/'+ID+'/integration/hook',{method:'POST',
  body:JSON.stringify({ev:'renewed-banking:server:withdraw',cat:'inventaire'})});
t('on corrige une rubrique', rub.status===200);
const hk3 = await (await fetch(B+'/api/hooks',{headers:{'x-origin-key':CLE}})).json();
t('et la ressource la reçoit', hk3.hooks.find(h=>h.ev==='renewed-banking:server:withdraw').cat==='inventaire');
t('une rubrique inventée est refusée',
  (await J('/api/platform/spaces/'+ID+'/integration/hook',{method:'POST',
    body:JSON.stringify({ev:'renewed-banking:server:withdraw',cat:'nawak'})})).status===400);

sect('Le scan se demande depuis le panneau');
// ⚠️ Le panneau ne parle jamais au serveur de jeu : il dépose une tâche,
// que la ressource vient chercher. Aucun port de jeu à ouvrir.
const dem = await J('/api/platform/spaces/'+ID+'/integration/scan',{method:'POST'});
t('la demande passe', dem.status===200 && dem.body.ok===true);
const att = (await J('/api/platform/spaces/'+ID+'/integration')).body;
t('l’écran sait dire « en attente »', att.scanEnAttente===true);
const dem2 = await J('/api/platform/spaces/'+ID+'/integration/scan',{method:'POST'});
t('⚠️ deux clics ne font pas deux scans', dem2.body.dejaDemande===true);
const pend = await (await fetch(B+'/api/actions/pending',{headers:{'x-origin-key':CLE}})).json();
t('la ressource la trouve dans ses tâches', pend.actions.some(x=>x.type==='scan'));

sect('Le fichier, pour qui préfère le déposer à la main');
const gen = await J('/api/platform/spaces/'+ID+'/integration/lua',{method:'POST',body:JSON.stringify(
  {choix:[{ev:'braquage:server:payer',cat:'boutique_caisse',ressource:'mon_braquage'}]})});
t('le panneau le génère encore', gen.status===200 && gen.body.retenus===1);
t('avec le bon évènement et la rubrique CHOISIE, pas la devinée',
  /AddEventHandler\('braquage:server:payer'/.test(gen.body.lua) && /cat = 'boutique_caisse'/.test(gen.body.lua));
const trace = await J('/api/platform/journal?action=plateforme.integration');
t('et chaque geste est tracé', (trace.body.entrees||[]).length>=3,
  (trace.body.entrees||[]).length+' entrées');

sect('⚠️ La ressource pose les écouteurs, et sans ouvrir de porte');
const RAC = readFileSync(new URL('../../resource/server/raccordements.lua', import.meta.url), 'utf8');
t('⚠️ AddEventHandler seulement, jamais RegisterNetEvent',
  /AddEventHandler\(ev,/.test(RAC) && !/^\s*RegisterNetEvent\s*\(/m.test(RAC));
t('⚠️ un écouteur relit ses réglages à chaque coup — FiveM ne sait pas le retirer',
  /local d = actifs\[ev\]/.test(RAC) && /if not d then return end/.test(RAC));
t('⚠️ les arguments inconnus sont ramenés à du texte avant la file',
  /local function sur\(/.test(RAC) && /args = sur\(/.test(RAC));
t('un évènement trop bavard est mis en sourdine', /MAX_PAR_MINUTE/.test(RAC));
const ACT = readFileSync(new URL('../../resource/server/actions.lua', import.meta.url), 'utf8');
t('le scan s’exécute depuis une tâche déposée par le panneau',
  /a\.type == 'scan'/.test(ACT) && /Origin\.Scanner/.test(ACT));

sect('Cloisonnement et accès');
const sp2 = await J('/api/platform/spaces',{method:'POST',body:JSON.stringify(
  {nom:'Autre Client',guildId:'555002222',staffRoleId:'900022'})});
const a3 = (await J('/api/platform/spaces/'+sp2.body.id+'/integration')).body;
t('⚠️ l’inventaire d’un client ne fuit pas chez un autre', a3.total===0 && a3.candidats.length===0);
const ckNyx = await login('Nyx','motdepassetest123');
const interdit = await J('/api/platform/spaces/'+ID+'/integration',{},ckNyx);
t('⚠️ un fondateur ordinaire ne lit pas l’intégration', interdit.status===403||interdit.status===404,
  String(interdit.status));
t('⚠️ ni un inconnu', (await J('/api/platform/spaces/'+ID+'/integration',{},'')).status===401);

sect('Ce qu’on accepte d’écrire est borné');
const gros = { ressources: Array.from({length:600},(_,i)=>({nom:'res'+i,etat:'started'})) };
const rGros = await poster('/api/inventory', CLE, gros);
t('un serveur qui annonce 600 ressources est tronqué à 400',
  rGros.status===200 && (await rGros.json()).recu===400);

const ko=T.filter(x=>!x[0]);
console.log('\n  '+(T.length-ko.length)+'/'+T.length+' contrôles passés');
if (ko.length) { console.log('\n  Échecs :'); ko.forEach(x=>console.log('   · '+x[1])); process.exit(1); }
