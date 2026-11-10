// ============================================================
// Le classement des logs par MOTS-CLÉS
//
// ⚠️ On ne voit jamais la base ni les scripts du serveur d'un client. À
// l'installation, ses journaux se rangeaient « au hasard » : le
// dictionnaire tenait en seize lignes, ne lisait que le nom de
// l'évènement, et envoyait tout ce qui parle de banque dans la caisse de
// la boutique. Ce qui suit fige le rangement sur de VRAIS noms
// d'évènements — ESX, QBCore, txAdmin, téléphones, banques — parce que
// c'est sur eux que le prochain serveur sera jugé.
// ============================================================
const B = process.env.BASE, KEY = process.env.KEY;
const T=[];const t=(n,ok,x='')=>{T.push([ok,n]);console.log((ok?'  ok    ':'  ÉCHEC ')+n+(x?'  → '+x:''));};
const sect=n=>console.log('\n── '+n+' '+'─'.repeat(Math.max(0,54-n.length)));
let ck='';
const J=async(p,o={},c)=>{const r=await fetch(B+p,{redirect:'manual',...o,headers:{'content-type':'application/json',cookie:c!==undefined?c:ck,...(o.headers||{})}});
  return {status:r.status, body:await r.json().catch(()=>null), r};};
const login=async(p,m)=>{const r=await fetch(B+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pseudo:p,password:m})});
  return (r.headers.get('set-cookie')||'').split(';')[0];};
const poster=(chemin,cle,corps)=>fetch(B+chemin,{method:'POST',
  headers:{'content-type':'application/json','x-origin-key':cle},body:JSON.stringify(corps)});

const C = (await import('../classeur.js')).default;
const range = (res, ev, texte) => C.estBruit(ev) ? 'BRUIT' : ((C.classer({ ressource:res, evenement:ev, texte }) || {}).cat || null);

sect('Banque et argent en jeu : des transactions, pas la boutique');
for (const [res, ev] of [['qb-banking','qb-banking:server:withdraw'], ['okokBanking','okokBanking:server:depositMoney'],
                         ['Renewed-Banking','Renewed-Banking:server:transfer'], ['esx_atm','esx_atm:withdraw'],
                         ['esx_billing','esx_billing:payBill'], ['esx_shops','esx_shops:buyItem'],
                         ['esx_vehicleshop','esx_vehicleshop:buyVehicle'], ['','givemoney']])
  t(`${ev} → Transactions`, range(res, ev) === 'inventaire', String(range(res, ev)));
t('⚠️ la caisse de la boutique ne reçoit que de l’argent RÉEL', range('tebex','tebex:purchase') === 'boutique_caisse');
t('la monnaie de boutique a sa rubrique', range('','boutique:addCoins') === 'boutique_monnaie'
  && range('','vip:setPremium') === 'boutique_monnaie');
t('et les produits réclamés la leur', range('','boutique:claimVehicle') === 'boutique_produits'
  && range('','tebex:redeemPackage') === 'boutique_produits');

sect('⚠️ Les accords : deux mots ensemble disent autre chose que chacun seul');
t('« give » seul est un échange entre joueurs', range('esx','esx:giveInventoryItem') === 'inventaire');
t('« admin » + « give » est un don du STAFF', range('','admin:giveMoney') === 'admin'
  && range('','admin:server:giveItemToPlayer') === 'admin');
t('« ambulance » seule n’est pas une facture : une réanimation', range('esx_ambulancejob','esx_ambulancejob:revive') === 'combat');
t('« ambulance » + « bill » en est une', range('wasabi_ambulance','wasabi_ambulance:billPatient') === 'facture_ems'
  && range('qb-ambulancejob','hospital:server:SendBill') === 'facture_ems');
t('le retrait d’une SOCIÉTÉ va à l’entreprise, pas aux transactions', range('esx_society','esx_society:withdrawMoney') === 'jobs'
  && range('qb-management','qb-bossmenu:server:withdrawMoney') === 'jobs');
t('une amende de police est de l’argent', range('qb-policejob','police:server:BillPlayer') === 'inventaire');
t('une arrestation est un geste de métier', range('qb-policejob','police:server:JailPlayer') === 'jobs');
t('un braquage de banque n’est pas un virement', range('qb-bankrobbery','qb-bankrobbery:server:setBankState') === 'jobs');
t('un objet jeté va au sol, pas au coffre', range('core_inventory','core_inventory:server:dropItem') === 'items_sol');
t('un joueur « dropped » est un départ, pas un objet jeté', range('esx','esx:playerDropped') === 'deconnexion'
  && range('','playerdropped') === 'deconnexion');

sect('La modération passe avant le reste');
t('un bannissement du menu admin va au REGISTRE, pas en « Action staff »', range('qb-adminmenu','qb-admin:server:ban') === 'bans'
  && range('txAdmin','txAdmin:events:playerBanned') === 'bans' && range('EasyAdmin','EasyAdmin:banPlayer') === 'bans');
t('une expulsion et un avertissement vont aux sanctions', range('txAdmin','txAdmin:events:playerKicked') === 'sanctions'
  && range('txAdmin','txAdmin:events:playerWarned') === 'sanctions' && range('vMenu','vMenu:KickPlayer') === 'sanctions');
t('les gestes du staff restent en « Action staff »', range('esx_adminmenu','esx_adminmenu:noclip') === 'admin'
  && range('qb-adminmenu','qb-admin:server:giveweapon') === 'admin'
  && range('EasyAdmin','EasyAdmin:TeleportPlayerToCoords') === 'admin');
t('une détection va à l’anticheat', range('','anticheat:detected') === 'anticheat'
  && range('','ac:server:godmodeDetected') === 'anticheat');
t('un ticket va aux reports', range('esx_report','esx_report:sendReport') === 'reports'
  && range('','report:server:newTicket') === 'reports');

sect('Joueurs, biens, activités');
for (const [res, ev, cat] of [
  ['esx','esx:playerLoaded','connexions'], ['qb-core','QBCore:Server:OnPlayerLoaded','connexions'],
  ['qb-core','QBCore:Server:OnPlayerUnload','deconnexion'], ['baseevents','baseevents:onPlayerKilled','combat'],
  ['esx','esx:onPlayerDeath','combat'], ['esx','esx:setJob','jobs'], ['qb-core','QBCore:Server:SetDuty','jobs'],
  ['qb-management','qb-bossmenu:server:HireEmployee','jobs'], ['','gang:addMember','jobs'],
  ['qb-houses','qb-houses:server:buyHouse','proprietes'], ['qb-garages','qb-garages:server:takeOut','proprietes'],
  ['ox_doorlock','ox_doorlock:setState','proprietes'], ['rcore_casino','casino:blackjack:bet','casino'],
  ['esx','esx:pickup','items_sol'], ['','chatMessage','ecran_joueur'],
  ['screenshot-basic','screenshot_basic:requestScreenshot','ecran_joueur']])
  t(`${ev} → ${cat}`, range(res, ev) === cat, String(range(res, ev)));
t('⚠️ un téléphone n’est pas un ticket', range('qb-phone','qb-phone:server:sendNewMail') === 'ecran_joueur'
  && range('lb-phone','phone:sendMessage') === 'ecran_joueur');
t('…mais un virement depuis le téléphone reste un virement', range('qb-phone','qb-phone:server:TransferMoney') === 'inventaire');

sect('⚠️ Le nom de la RESSOURCE compte');
t('un évènement muet prend la rubrique de sa ressource',
  range('jg-advancedgarages','jg-advancedgarages:server:doThing') === 'proprietes'
  && range('esx_society','esx_society:doThing') === 'jobs');
t('⚠️ …sans compter deux fois le préfixe que l’évènement répète',
  C.classer({ressource:'esx_society',evenement:'esx_society:doThing'}).score
  === C.classer({ressource:'esx_society',evenement:'doThing'}).score);
t('un nom collé se découpe : « advancedgarages » contient « garages »', C.classer({ressource:'jg-advancedgarages',evenement:'x'}) !== null);
t('« withdrawmoney » se lit withdraw + money', JSON.stringify(C.segmenter('withdrawmoney')) === '["withdraw","money"]');
t('⚠️ mais « carpet » ne devient pas car + pet', C.segmenter('carpetx') === null);

sect('⚠️ Les pièges : des mots, pas des morceaux de mots');
t('« health » n’est pas « heal »', range('','health:restore') === null);
t('« datastore » n’est pas un magasin',
  C.classer({ ressource:'esx_datastore', evenement:'esx_datastore:saveDataStore' }) === null);
t('une LECTURE n’est pas un fait : `get…` n’est jamais journalisé',
  range('esx_addonaccount','esx_addonaccount:getSharedAccount') === 'BRUIT' && range('','bank:getBalance') === 'BRUIT');
t('« reporter » (le métier) n’est pas un report', range('weazelnews','weazelnews:reporter') === null);
t('« mortgage » est un prêt immobilier, pas une « mort »', range('','mortgage:pay') === 'proprietes');
t('« oracle » ne contient pas « cle »', range('','oracle:query') === null);
t('« tp » ne reconnaît pas tout ce qui commence par t', range('','truc:machin') === null);
t('« withdraw » n’est pas du bruit à cause de « draw »', range('','banking:server:withdraw') === 'inventaire');

sect('Le bruit');
t('un évènement d’affichage est écarté', range('','hud:update') === 'BRUIT' && range('','playerHudTick') === 'BRUIT'
  && range('','esx_status:set') === 'BRUIT');
t('⚠️ « update » n’écarte plus un nom qui dit de quoi il s’agit',
  range('qb-core','QBCore:Server:OnJobUpdate') === 'jobs');
t('⚠️ ni « coords » une téléportation du staff', range('EasyAdmin','EasyAdmin:TeleportPlayerToCoords') === 'admin');
t('« je ne sais pas » reste une réponse', C.classer({ressource:'machin',evenement:'truc:bidule'}) === null);
t('la réponse dit POURQUOI — le mot qui a décidé', C.classer({ressource:'',evenement:'banking:withdraw'}).mot === 'withdraw'
  || C.classer({ressource:'',evenement:'banking:withdraw'}).mot === 'banking');

/* ============================================================
   Un serveur DÉJÀ branché profite du nouveau dictionnaire
   ============================================================ */
sect('⚠️ Au démarrage, les raccordements déjà posés sont re-rangés');
// Quatre raccordements existaient avant le démarrage de l'API, rangés comme
// les rangeait l'ancien dictionnaire. Personne ne relance un scan chez un
// client qui tourne : c'est donc au dictionnaire d'aller jusqu'à eux.
{
  const r = await fetch(B+'/api/hooks',{headers:{'x-origin-key':KEY}});
  const anciens = (await r.json()).hooks;
  const de0 = ev => (anciens.find(x => x.ev === ev) || {}).cat;
  t('le retrait bancaire a quitté « Boutique : caisse »', de0('vieux-banking:server:withdraw') === 'inventaire', String(de0('vieux-banking:server:withdraw')));
  t('le message de téléphone a quitté « Logs des Reports »', de0('vieux-phone:sendMessage') === 'ecran_joueur', String(de0('vieux-phone:sendMessage')));
  t('le bannissement a rejoint le registre', de0('vieux-admin:server:ban') === 'bans', String(de0('vieux-admin:server:ban')));
  t('⚠️ celui qu’un humain avait rangé n’a PAS bougé — même mal rangé', de0('choisi:a:la:main:withdraw') === 'casino', String(de0('choisi:a:la:main:withdraw')));
}

/* ============================================================
   Bout en bout : un serveur inconnu, scanné, puis corrigé
   ============================================================ */
sect('Un scan range, et le rangement se corrige');
ck = await login('Sup','motdepassesup12345');
const sp = await J('/api/platform/spaces',{method:'POST',body:JSON.stringify(
  {nom:'Serveur du collègue',guildId:'555002222',staffRoleId:'900022'})});
const ID = sp.body.id, CLE = sp.body.cle;
const sc = await poster('/api/scan', CLE, { lus: 12, protegees: [], ressources: [
  { nom:'okokBanking', evenements:['okokBanking:server:withdrawMoney','okokBanking:server:updateHud'] },
  { nom:'qb-adminmenu', evenements:['qb-admin:server:ban','qb-admin:server:giveweapon'] },
  { nom:'esx_society', evenements:['esx_society:withdrawMoney','esx_society:doThing'] },
  { nom:'lb-phone', evenements:['phone:sendMessage'] },
  { nom:'mon_script', evenements:['truc:machin'] }
]});
t('le scan est accepté', sc.status === 200);
const hooks = async () => { const r = await fetch(B+'/api/hooks',{headers:{'x-origin-key':CLE}}); return (await r.json()).hooks; };
let h = await hooks();
const de = ev => (h.find(x => x.ev === ev) || {}).cat;
t('le retrait bancaire est en Transactions', de('okokBanking:server:withdrawMoney') === 'inventaire', String(de('okokBanking:server:withdrawMoney')));
t('le bannissement est au registre', de('qb-admin:server:ban') === 'bans', String(de('qb-admin:server:ban')));
t('le don d’arme reste en Action staff', de('qb-admin:server:giveweapon') === 'admin');
t('le retrait de société est en Entreprise', de('esx_society:withdrawMoney') === 'jobs');
t('⚠️ l’évènement muet d’une ressource parlante est rangé avec elle', de('esx_society:doThing') === 'jobs');
t('le message du téléphone est en Écran du joueur', de('phone:sendMessage') === 'ecran_joueur');
t('le bruit n’est pas raccordé', !h.some(x => x.ev === 'okokBanking:server:updateHud'));
t('ce qui n’évoque rien non plus', !h.some(x => x.ev === 'truc:machin'));

sect('⚠️ Un rangement fait à la main ne bouge plus jamais');
const dep = await J('/api/platform/spaces/'+ID+'/integration/hook',{method:'POST',body:JSON.stringify(
  {ev:'phone:sendMessage', cat:'reports'})});
t('on déplace un raccordement à la main', dep.status === 200, String(dep.status));
await poster('/api/scan', CLE, { lus: 12, protegees: [], ressources: [
  { nom:'lb-phone', evenements:['phone:sendMessage'] },
  { nom:'okokBanking', evenements:['okokBanking:server:withdrawMoney'] }]});
h = await hooks();
t('⚠️ un nouveau scan ne défait pas le choix humain', de('phone:sendMessage') === 'reports', String(de('phone:sendMessage')));
t('et laisse le reste où il était', de('okokBanking:server:withdrawMoney') === 'inventaire');

sect('⚠️ Une rubrique inconnue ne tombe plus en « Action staff »');
const env = ev => poster('/api/ingest', CLE, { events: ev });
await env([
  { cat:'banque', sev:'info', msg:'Luca a retiré 500 $', actor:{key:'license:a',name:'Luca',sid:3}, res:'ma_banque', data:{} },
  { sev:'info', msg:'Mia a été expulsée du serveur', actor:{key:'license:b',name:'Mia',sid:4}, res:'mon_admin', data:{} },
  { cat:'vehicules', sev:'info', msg:'Tom a sorti sa voiture du garage', actor:{key:'license:c',name:'Tom',sid:5}, res:'mes_garages', data:{} },
  { cat:'nimportequoi', sev:'info', msg:'zzz qqq', actor:{key:'license:d',name:'Zed',sid:6}, res:'x', data:{} },
  { cat:'casino', sev:'info', msg:'Luca a misé 200 $', actor:{key:'license:a',name:'Luca',sid:3}, res:'x', data:{} }
]);
await new Promise(r => setTimeout(r, 250));
await J('/api/platform/enter',{method:'POST',body:JSON.stringify({spaceId:ID})});
const evs = (await J('/api/events?limit=50')).body.events || [];
const ou = m => (evs.find(e => e.msg.includes(m)) || {}).cat;
const dn = m => (evs.find(e => e.msg.includes(m)) || {}).d || {};
t('`cat = "banque"` va en Transactions', ou('retiré 500') === 'inventaire', String(ou('retiré 500')));
t('un log SANS rubrique est rangé d’après sa phrase', ou('expulsée') === 'sanctions', String(ou('expulsée')));
t('`cat = "vehicules"` + « garage » va à l’immobilier', ou('garage') === 'proprietes', String(ou('garage')));
t('⚠️ ce qui n’évoque VRAIMENT rien garde le fourre-tout — et se voit', ou('zzz') === 'admin'
  && dn('zzz').rubriqueDemandee === 'nimportequoi', JSON.stringify(dn('zzz')));
t('la demande d’origine reste lisible dans les données', dn('retiré 500').rubriqueDemandee === 'banque'
  && typeof dn('retiré 500').rangePar === 'string', JSON.stringify(dn('retiré 500')));
t('⚠️ une rubrique CONNUE n’est jamais re-rangée', ou('misé 200') === 'casino' && !dn('misé 200').rangePar);

const n=T.filter(([o])=>o).length;
console.log(`\n  ${n}/${T.length} contrôles passés`);
process.exit(n===T.length?0:1);
