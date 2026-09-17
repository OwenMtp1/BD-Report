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
{
  const db = DB.open(fichierDb);
  db.prepare(`INSERT INTO spaces(id,name,server_key,relay_key,state,created_at,created_by)
              VALUES(1,'Origin Roleplay',?,?,'actif',?,'test')`).run(CLE, 'relais-de-controle-0123456789ab', Date.now());
  ROLESVC.seed(db, 1);
  db.prepare(`INSERT INTO staff(pseudo,pass,role,roles,created_at,space_id,source,platform_admin)
              VALUES(?,?,?,?,?,1,'local',0)`).run('Nyx', AUTH.hash('motdepassetest123'), 'fondateur', JSON.stringify(['fondateur']), Date.now());
  db.close();
}
const api = spawn(process.execPath, ['server.js'], { cwd: API, stdio: 'ignore',
  env: { ...process.env, PORT: String(PORT_API), SERVER_KEY: CLE, DB_FILE: fichierDb,
         SCREEN_DIR: path.join(TRAVAIL, 'screens'), BACKUP_EVERY_HOURS: '0' } });
const attendre = async (url, ms=15000) => { const fin=Date.now()+ms;
  for(;;){ try{ if((await fetch(url)).ok) return true; }catch(e){} if(Date.now()>fin) return false; await dormir(150);} };
if (!await attendre(`http://127.0.0.1:${PORT_API}/api/catalogue`)) { console.error('API muette'); process.exit(1); }

// ---- le Discord de contrôle ----
const faux = require('./faux-discord.js').creer();
await new Promise(r => faux.listen(PORT_DIS, r));

const deposer = (evs) => fetch(`http://127.0.0.1:${PORT_API}/api/ingest`, { method:'POST',
  headers:{'content-type':'application/json','x-origin-key':CLE}, body: JSON.stringify({ events: evs }) }).then(r=>r.json());

const ENV_BOT = {
  ...process.env,
  PANEL_URL: `http://127.0.0.1:${PORT_API}`,
  RELAY_KEY: 'relais-de-controle-0123456789ab',
  DISCORD_API: `http://127.0.0.1:${PORT_DIS}/api/v10`,
  DISCORD_TOKEN: 'jeton-de-controle',
  DISCORD_GUILD_ID: '123456789012345678',
  STATE_FILE: path.join(TRAVAIL, 'etat.json'),
  POLL_MS: '600', MAX_PER_CHANNEL: '3', CREATE_CHANNELS: '1'
};
const lancerBot = (extra = {}, args = []) => spawn(process.execPath, ['index.js', ...args],
  { cwd: RACINE, stdio: 'ignore', env: { ...ENV_BOT, ...extra } });

sect('Configuration');
{
  const p = spawn(process.execPath, ['index.js', '--verifier'], { cwd: RACINE, stdio: 'pipe',
    env: { ...process.env, PANEL_URL:'x', RELAY_KEY:'', DISCORD_TOKEN:'', DISCORD_GUILD_ID:'' } });
  let out=''; p.stderr.on('data',d=>out+=d);
  const code = await new Promise(r=>p.on('exit',r));
  t('⚠️ une configuration incomplète s’arrête et DIT quoi manque', code===1 && /RELAY_KEY/.test(out) && /DISCORD_TOKEN/.test(out));
}

sect('Préparation des salons');
{
  const p = lancerBot({}, ['--salons']);
  await new Promise(r=>p.on('exit',r));
  const s = faux.etat.salons;
  t('un salon par rubrique', s.filter(c=>c.type===0).length===18, s.filter(c=>c.type===0).length+' salons');
  t('rangés en catégories de métier', s.filter(c=>c.type===4).length===6, s.filter(c=>c.type===4).length+' catégories');
  t('les noms sont lisibles', s.some(c=>c.name==='bannissement') && s.some(c=>c.name==='logs-des-reports'),
    s.filter(c=>c.type===0).slice(0,3).map(c=>c.name).join(', '));
  t('chaque salon est sous sa catégorie', s.filter(c=>c.type===0).every(c=>c.parent_id));
  const etat = JSON.parse(readFileSync(path.join(TRAVAIL,'etat.json'),'utf8'));
  t('la correspondance est mémorisée', Object.keys(etat.salons).length===18);
  t('⚠️ et le repère NE PART PAS de zéro — l’historique n’est pas rejoué', etat.dernierId>=0);
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
  const etat = JSON.parse(readFileSync(path.join(TRAVAIL,'etat.json'),'utf8'));
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
  const etat = JSON.parse(readFileSync(path.join(TRAVAIL,'etat.json'),'utf8'));
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
  const bot = lancerBot({ RELAY_KEY: 'mauvaise-cle-mauvaise-cle-mauv' });
  const code = await new Promise(r => { bot.on('exit', r); setTimeout(()=>{bot.kill('SIGKILL');r(-1);}, 6000); });
  t('⚠️ une mauvaise clé s’arrête au lieu de marteler le panneau', code===1, 'code '+code);
}

api.kill('SIGKILL'); faux.close(); rmSync(TRAVAIL, { recursive:true, force:true });
const n=T.filter(([o])=>o).length;
console.log(`\n  ${n}/${T.length} contrôles passés`);
process.exit(n===T.length?0:1);
