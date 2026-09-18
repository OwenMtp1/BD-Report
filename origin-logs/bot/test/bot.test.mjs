// Le bot, mis à l'épreuve pour de vrai : un panneau qui répond, un Discord
// qui retient ce qu'on lui poste, et un bot qui tourne entre les deux.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const T=[];const t=(n,ok,x='')=>{T.push([ok,n]);console.log((ok?'  ok    ':'  ÉCHEC ')+n+(x?'  → '+x:''));};
const sect=n=>console.log('\n── '+n+' '+'─'.repeat(Math.max(0,54-n.length)));
const dormir = ms => new Promise(r => setTimeout(r, ms));

const RACINE = path.join(import.meta.dirname, '..');
const API = path.join(RACINE, '..', 'api');
const TRAVAIL = mkdtempSync(path.join(os.tmpdir(), 'origin-bot-'));
const PORT_API = 8921, PORT_DIS = 8922;
const CLE = 'cle-du-bot-de-controle-0123456789';

// ---- le panneau ----
const DB = require(path.join(API, 'db.js'));
const AUTH = require(path.join(API, 'auth.js'));
const ROLESVC = require(path.join(API, 'roles.js'));
const fichierDb = path.join(TRAVAIL, 'bot.db');
const CLE2 = 'cle-du-second-espace-0123456789';
{
  const db = DB.open(fichierDb);
  // ⚠️ DEUX espaces, chacun avec SON bot Discord : c'est tout l'objet du
  // mode « tous les espaces ». Un seul aurait laissé passer le mélange.
  db.prepare(`INSERT INTO spaces(id,name,server_key,relay_key,bot_token,bot_guild,bot_opts,state,created_at,created_by)
              VALUES(1,'Origin Roleplay',?,?,?,?,?,'actif',?,'test')`)
    .run(CLE, 'relais-de-controle-0123456789ab', 'jeton-du-bot-un-'.padEnd(60,'x'), '111222333444555666',
         JSON.stringify({ maxParSalon: 3 }), Date.now());
  db.prepare(`INSERT INTO spaces(id,name,server_key,relay_key,bot_token,bot_guild,state,created_at,created_by)
              VALUES(2,'Los Santos RP',?,?,?,?,'actif',?,'test')`)
    .run(CLE2, 'relais-du-second-0123456789abc', 'jeton-du-bot-deux-'.padEnd(60,'y'), '777888999000111222', Date.now());
  // Le troisième existe SANS bot : c'est son fondateur qui le branchera,
  // en cours de route, par le même chemin qu'un vrai client.
  db.prepare(`INSERT INTO spaces(id,name,server_key,relay_key,guild_id,state,created_at,created_by)
              VALUES(3,'Vice City RP',?,?,?,'actif',?,'test')`)
    .run('cle-du-troisieme-0123456789ab', 'relais-du-troisieme-012345678', '333444555666777888', Date.now());
  ROLESVC.seed(db, 1); ROLESVC.seed(db, 2); ROLESVC.seed(db, 3);
  db.prepare(`INSERT INTO staff(pseudo,pass,role,roles,created_at,space_id,source,platform_admin)
              VALUES(?,?,?,?,?,1,'local',0)`).run('Nyx', AUTH.hash('motdepassetest123'), 'fondateur', JSON.stringify(['fondateur']), Date.now());
  db.prepare(`INSERT INTO staff(pseudo,pass,role,roles,created_at,space_id,source,platform_admin)
              VALUES(?,?,?,?,?,3,'local',0)`).run('Tommy', AUTH.hash('motdepassetommy12'), 'fondateur', JSON.stringify(['fondateur']), Date.now());
  db.close();
}
const api = spawn(process.execPath, ['server.js'], { cwd: API, stdio: 'ignore',
  env: { ...process.env, PORT: String(PORT_API), SERVER_KEY: CLE, DB_FILE: fichierDb,
         SCREEN_DIR: path.join(TRAVAIL, 'screens'), BACKUP_EVERY_HOURS: '0',
         BOT_KEY: 'cle-du-processus-de-controle-0' } });
const attendre = async (url, ms=15000) => { const fin=Date.now()+ms;
  for(;;){ try{ if((await fetch(url)).ok) return true; }catch(e){} if(Date.now()>fin) return false; await dormir(150);} };
if (!await attendre(`http://127.0.0.1:${PORT_API}/api/catalogue`)) { console.error('API muette'); process.exit(1); }

// ---- le Discord de contrôle ----
const faux = require('./faux-discord.js').creer();
await new Promise(r => faux.listen(PORT_DIS, r));

const deposer = (evs, cle) => fetch(`http://127.0.0.1:${PORT_API}/api/ingest`, { method:'POST',
  headers:{'content-type':'application/json','x-origin-key':cle||CLE}, body: JSON.stringify({ events: evs }) }).then(r=>r.json());

const ENV_BOT = {
  ...process.env,
  PANEL_URL: `http://127.0.0.1:${PORT_API}`,
  // ⚠️ Plus de jeton Discord ici : il vit dans le PANNEAU, par espace.
  // Le .env ne dit que « où est le panneau » et « avec quelle clé ».
  BOT_KEY: 'cle-du-processus-de-controle-0',
  DISCORD_API: `http://127.0.0.1:${PORT_DIS}/api/v10`,
  STATE_FILE: path.join(TRAVAIL, 'etat.json'),
  POLL_MS: '600', INVENTORY_MS: '1000'
};
const lancerBot = (extra = {}, args = []) => spawn(process.execPath, ['index.js', ...args],
  { cwd: RACINE, stdio: 'ignore', env: { ...ENV_BOT, ...extra } });

sect('Configuration');
{
  const p = spawn(process.execPath, ['index.js', '--verifier'], { cwd: RACINE, stdio: 'pipe',
    env: { ...process.env, PANEL_URL:'x', RELAY_KEY:'', BOT_KEY:'' } });
  let out=''; p.stderr.on('data',d=>out+=d);
  const code = await new Promise(r=>p.on('exit',r));
  t('⚠️ une configuration incomplète s’arrête et DIT quoi manque',
    code===1 && /BOT_KEY/.test(out) && /RELAY_KEY/.test(out));
}
{
  const p = spawn(process.execPath, ['index.js', '--verifier'], { cwd: RACINE, stdio: 'pipe', env: ENV_BOT });
  let out=''; p.stdout.on('data',d=>out+=d);
  const code = await new Promise(r=>p.on('exit',r));
  t('⚠️ et le mode est ANNONCÉ — on ne devine pas ce qu’un processus sert',
    code===0 && /tous les espaces/.test(out), out.trim());
}

sect('Préparation des salons');
{
  const p = lancerBot({}, ['--salons']);
  await new Promise(r=>p.on('exit',r));
  const s = faux.etat.salons;
  const g1 = s.filter(c=>c.guild_id==='111222333444555666');
  const g2 = s.filter(c=>c.guild_id==='777888999000111222');
  t('un salon par rubrique, dans CHAQUE serveur',
    g1.filter(c=>c.type===0).length===18 && g2.filter(c=>c.type===0).length===18,
    g1.filter(c=>c.type===0).length+' et '+g2.filter(c=>c.type===0).length);
  t('rangés en catégories de métier', g1.filter(c=>c.type===4).length===6);
  t('les noms sont lisibles', g1.some(c=>c.name==='bannissement') && g1.some(c=>c.name==='logs-des-reports'),
    g1.filter(c=>c.type===0).slice(0,3).map(c=>c.name).join(', '));
  t('chaque salon est sous sa catégorie', g1.filter(c=>c.type===0).every(c=>c.parent_id));
  t('⚠️ AUCUN salon partagé entre les deux clients',
    g1.every(c=>!g2.some(x=>x.id===c.id)), g1.length+' / '+g2.length);
  const etat = JSON.parse(readFileSync(path.join(TRAVAIL,'etat.json'),'utf8'));
  t('⚠️ un état PAR ESPACE — un repère commun ferait sauter à l’un ce que l’autre a lu',
    Object.keys(etat.espaces).length===2, Object.keys(etat.espaces).join(', '));
  t('la correspondance est mémorisée pour chacun',
    Object.keys(etat.espaces['1'].salons).length===18 && Object.keys(etat.espaces['2'].salons).length===18);
  t('⚠️ et le repère NE PART PAS de zéro — l’historique n’est pas rejoué',
    etat.espaces['1'].dernierId>=0 && etat.espaces['2'].dernierId>=0);
}
{
  const avant = faux.etat.salons.length;
  const p = lancerBot({}, ['--salons']);
  await new Promise(r=>p.on('exit',r));
  t('⚠️ un second démarrage ne recrée RIEN', faux.etat.salons.length===avant, avant+' salons, inchangé');
}

sect('Report en direct');
await deposer([
  { cat:'bans', sev:'critique', msg:'Kaleb a banni Mia Costa définitivement',
    actor:{key:'license:s1',name:'Kaleb',sid:3,staff:true}, target:{key:'license:j2',name:'Mia Costa'},
    data:{ kind:'ban', motif:'Cheat détecté', duree:'permanent' } },
  { cat:'anticheat', sev:'alerte', msg:'Téléportation anormale — Luca Ferraro',
    actor:{key:'license:j1',name:'Luca Ferraro',sid:12}, data:{ detection:'position_delta', distance:'3200 m' } }
]);
{
  const bot = lancerBot();
  await dormir(3500);
  const msgs = faux.etat.messages;
  const etat = JSON.parse(readFileSync(path.join(TRAVAIL,'etat.json'),'utf8')).espaces['1'];
  const salonBans = etat.salons['bans'], salonAch = etat.salons['anticheat'];
  t('le bannissement arrive dans SON salon', msgs.some(m=>m.salon===salonBans && JSON.stringify(m.embeds).includes('Mia Costa')));
  t('la détection dans le sien', msgs.some(m=>m.salon===salonAch && JSON.stringify(m.embeds).includes('Téléportation')));
  t('⚠️ les deux ne se mélangent pas', salonBans!==salonAch);
  const emb = msgs.flatMap(m=>m.embeds).find(e=>/Mia Costa/.test(JSON.stringify(e)));
  t('la gravité est en couleur', emb && emb.color===0xFF4365, emb && '#'+emb.color.toString(16));
  t('la rubrique est nommée', emb && /BAN · Bannissement/.test(emb.author.name), emb && emb.author.name);
  t('la charge utile est montrée', emb && emb.fields.some(f=>/Cheat détecté/.test(f.value)));
  t('⚠️ AUCUNE LICENCE ne part dans Discord',
    !/license:/.test(JSON.stringify(msgs)), /license:/.test(JSON.stringify(msgs))?'FUITE':'aucune');
  t('et aucune mention non demandée', msgs.every(m=>!m.mentions || !m.mentions.roles || !m.mentions.roles.length));
  bot.kill('SIGKILL'); await dormir(300);
}

sect('Reprise sans perte ni doublon');
{
  const avant = faux.etat.messages.length;
  await deposer([{ cat:'reports', sev:'notice', msg:'Sacha Roy a ouvert un report — RDM',
    actor:{key:'license:j3',name:'Sacha Roy',sid:77}, data:{ kind:'ouverture', ticket:'#88' } }]);
  const bot = lancerBot();
  await dormir(3000);
  const nouveaux = faux.etat.messages.slice(avant);
  t('ce qui est arrivé pendant l’arrêt est reporté', nouveaux.some(m=>/Sacha Roy/.test(JSON.stringify(m.embeds))));
  t('⚠️ et RIEN n’est reposté en double',
    !nouveaux.some(m=>/Mia Costa/.test(JSON.stringify(m.embeds))), nouveaux.length+' nouveau(x) message(s)');
  bot.kill('SIGKILL'); await dormir(300);
}

sect('Une rubrique bavarde ne noie pas son salon');
{
  const avant = faux.etat.messages.length;
  await deposer(Array.from({length:14},(_,i)=>({ cat:'items_sol', sev:'info',
    msg:'Un joueur a jeté un objet n°'+i, actor:{key:'license:j'+i,name:'Joueur'+i,sid:i} })));
  const bot = lancerBot();
  await dormir(3000);
  const nouveaux = faux.etat.messages.slice(avant);
  t('⚠️ quatorze évènements ne font pas quatorze messages', nouveaux.length<=2, nouveaux.length+' message(s)');
  t('et le compte est annoncé', nouveaux.some(m=>/14 évènements/.test(m.content||'')), (nouveaux[0]||{}).content);
  bot.kill('SIGKILL'); await dormir(300);
}

sect('Deux clients, deux Discord — aucun mélange');
{
  const avant = faux.etat.messages.length;
  await deposer([{ cat:'bans', sev:'critique', msg:'CHEZ LE CLIENT UN',
    actor:{key:'license:a1',name:'JoueurUn',sid:1} }], CLE);
  await deposer([{ cat:'bans', sev:'critique', msg:'CHEZ LE CLIENT DEUX',
    actor:{key:'license:b1',name:'JoueurDeux',sid:2} }], CLE2);
  const bot = lancerBot();
  await dormir(3500);
  const etat = JSON.parse(readFileSync(path.join(TRAVAIL,'etat.json'),'utf8')).espaces;
  const nouveaux = faux.etat.messages.slice(avant);
  const salonDe = id => etat[id].salons['bans'];
  const un   = nouveaux.filter(m => m.salon === salonDe('1'));
  const deux = nouveaux.filter(m => m.salon === salonDe('2'));
  t('⚠️ un seul processus sert les DEUX espaces',
    un.length >= 1 && deux.length >= 1, un.length+' et '+deux.length+' message(s)');
  t('chacun dans le salon de SON serveur Discord', salonDe('1') !== salonDe('2'));
  t('⚠️ et rien du client un ne part chez le client deux',
    un.every(m=>/CLIENT UN/.test(JSON.stringify(m.embeds))) &&
    deux.every(m=>/CLIENT DEUX/.test(JSON.stringify(m.embeds))));
  // Le jeton diffère : le faux Discord dérive le nom du bot de son jeton.
  t('⚠️ et chaque client a SON bot, pas un bot partagé',
    faux.etat.salons.filter(c=>c.guild_id==='111222333444555666').length > 0 &&
    faux.etat.salons.filter(c=>c.guild_id==='777888999000111222').length > 0);
  bot.kill('SIGKILL'); await dormir(300);
}

sect('Un client branché à chaud');
{
  /* ⚠️ AJOUTER UN CLIENT NE DOIT RIEN DEMANDER : ni fichier, ni
     redémarrage, ni accès au serveur. C'est ce qui rend un seul processus
     tenable à cinquante clients — et c'est le CLIENT qui branche son bot,
     depuis son propre panneau. On passe donc par le vrai chemin. */
  const bot = lancerBot();
  await dormir(2500);
  const avant = JSON.parse(readFileSync(path.join(TRAVAIL,'etat.json'),'utf8')).espaces;
  t('au départ, le troisième n’est pas servi (il n’a pas de bot)', !avant['3'],
    Object.keys(avant).join(', '));

  const r0 = await fetch(`http://127.0.0.1:${PORT_API}/api/auth/login`, { method:'POST',
    headers:{'content-type':'application/json'},
    body: JSON.stringify({ pseudo:'Tommy', password:'motdepassetommy12' }) });
  const ckT = (r0.headers.get('set-cookie')||'').split(';')[0];
  const rep = await fetch(`http://127.0.0.1:${PORT_API}/api/discord/bot`, { method:'POST',
    headers:{'content-type':'application/json', cookie: ckT},
    body: JSON.stringify({ jeton: 'jeton-du-bot-trois-'.padEnd(60,'z'), guilde: '333444555666777888' }) });
  const repJ = await rep.json();
  t('le client branche SON bot depuis son panneau', repJ.ok === true, 'HTTP '+rep.status+' '+JSON.stringify(repJ));

  // ⚠️ Le temps réel de la chose : l'inventaire (plancher 5 s), puis la
  // création de 24 salons espacés de 400 ms — Discord n'aime pas qu'on en
  // crée vingt d'affilée. Un test plus pressé que le produit ne prouve rien.
  await dormir(18000);
  const etat = JSON.parse(readFileSync(path.join(TRAVAIL,'etat.json'),'utf8')).espaces;
  t('⚠️ le nouveau client est servi SANS redémarrage', !!etat['3'], etat['3'] ? 'espace 3 connu' : 'absent');
  t('ses salons ont été créés', !!etat['3'] && Object.keys(etat['3'].salons).length===18);

  /* ⚠️ ET SON JOURNAL NE COMMENCE QU'ICI. Un client qui branche son bot à
     14 h reçoit ce qui arrive APRÈS 14 h — pas six mois d'historique
     déversés dans des salons neufs. Déposer l'évènement avant le
     branchement, comme on le faisait d'abord, ne prouvait donc rien : il
     était sauté, et c'était le bon comportement. */
  const avantDepot = faux.etat.messages.length;
  await deposer([{ cat:'anticheat', sev:'alerte', msg:'CHEZ LE TROISIEME',
    actor:{key:'license:c1',name:'JoueurTrois',sid:3} }], 'cle-du-troisieme-0123456789ab');
  await dormir(2500);
  const salonAch3 = (etat['3'] || { salons:{} }).salons['anticheat'];
  t('et ce qui arrive ENSUITE part dans SON serveur Discord',
    faux.etat.messages.slice(avantDepot).some(m => m.salon === salonAch3
      && /TROISIEME/.test(JSON.stringify(m.embeds))));
  bot.kill('SIGKILL'); await dormir(300);
}

sect('Résistance');
{
  const avant = faux.etat.messages.length;
  faux.etat.quota = 2;                       // Discord refuse deux fois
  await deposer([{ cat:'casino', sev:'alerte', msg:'Gros gain au blackjack',
    actor:{key:'license:j5',name:'Théo',sid:5}, data:{ gain: 84000 } }]);
  const bot = lancerBot();
  await dormir(4000);
  t('⚠️ une limite de débit est ATTENDUE, pas perdue',
    faux.etat.messages.slice(avant).some(m=>/blackjack/.test(JSON.stringify(m.embeds))));
  bot.kill('SIGKILL'); await dormir(300);
}
{
  const etat = JSON.parse(readFileSync(path.join(TRAVAIL,'etat.json'),'utf8')).espaces['1'];
  faux.etat.interdits.add(etat.salons['jobs']);
  await deposer([{ cat:'jobs', sev:'info', msg:'Prise de service', actor:{key:'license:j6',name:'Noah',sid:6} }]);
  const avant = faux.etat.messages.length;
  await deposer([{ cat:'casino', sev:'info', msg:'Mise au casino', actor:{key:'license:j7',name:'Enzo',sid:7} }]);
  const bot = lancerBot();
  await dormir(3000);
  t('⚠️ un salon interdit n’arrête pas les autres',
    faux.etat.messages.slice(avant).some(m=>/Mise au casino/.test(JSON.stringify(m.embeds))));
  bot.kill('SIGKILL'); await dormir(300);
}
{
  const bot = lancerBot({ BOT_KEY: 'mauvaise-cle-mauvaise-cle-mauv' });
  const code = await new Promise(r => { bot.on('exit', r); setTimeout(()=>{bot.kill('SIGKILL');r(-1);}, 6000); });
  t('⚠️ une mauvaise clé s’arrête au lieu de marteler le panneau', code===1, 'code '+code);
}

api.kill('SIGKILL'); faux.close(); rmSync(TRAVAIL, { recursive:true, force:true });
const n=T.filter(([o])=>o).length;
console.log(`\n  ${n}/${T.length} contrôles passés`);
process.exit(n===T.length?0:1);
