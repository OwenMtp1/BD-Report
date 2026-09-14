#!/usr/bin/env node
// ============================================================
// Origin Roleplay — jeu d'essai
// Dépose des évènements réalistes via la VRAIE route d'ingestion,
// pour vérifier toute la chaîne (clé serveur, base, panneau, flux)
// avant d'avoir branché le serveur de jeu.
//   SERVER_KEY=... node seed-demo.js [nombre]
// ============================================================
'use strict';
try {
  const fs = require('node:fs'), path = require('node:path');
  const f = path.join(__dirname, '.env');
  if (fs.existsSync(f) && typeof process.loadEnvFile === 'function') process.loadEnvFile(f);
} catch (e) {}
const URL_API = process.env.API_URL || 'http://127.0.0.1:' + (process.env.PORT || 8080);
const KEY = process.env.SERVER_KEY || '';
const N = Math.min(5000, Math.max(1, Number(process.argv[2]) || 600));
if (!KEY) { console.error('\n  SERVER_KEY manquante — utilisez la même valeur que le serveur.\n'); process.exit(1); }

const R = a => a[Math.floor(Math.random() * a.length)];
const I = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const hex = n => Array.from({length:n}, () => '0123456789abcdef'[I(0,15)]).join('');
const money = n => n.toLocaleString('fr-FR').replace(/ | /g, ' ') + ' $';

const PRENOMS = ['Luca','Enzo','Maya','Théo','Sofia','Nathan','Camille','Yanis','Léa','Adam','Chloé','Rayan','Jade','Ilyes','Manon','Noah','Inès','Gabriel'];
const NOMS = ['Moreau','Delacroix','Ferrand','Bianchi','Okonkwo','Vasquez','Lambert','Reyes','Nguyen','Costa','Traoré','Marchetti','Dubois','Rossi','Blake'];
const ZONES = ['Vespucci Beach','Sandy Shores','Mirror Park','Grove Street','Legion Square','Paleto Bay','Vinewood Hills','Route 68'];
const ITEMS = ['bread','water','bandage','medikit','lockpick','ammo-9','weapon_pistol','repairkit','gold_chain'];
const VEHS = ['sultanrs','blista','sandking','police3','ambulance','t20','dominator','buffalo4'];
const ARMES = ['WEAPON_PISTOL','WEAPON_SMG','WEAPON_PUMPSHOTGUN','WEAPON_KNIFE','WEAPON_CARBINERIFLE'];
const BANQUES = ['la Fleeca de Legion Square','le Pacific Standard','la bijouterie Vangelico'];
const MOTIFS = ['RDM sur Legion Square','VDM répété','Fail RP en braquage','Metagaming Discord','Cheat détecté — menu illégal'];

const joueurs = Array.from({length:22}, () => {
  const nom = R(PRENOMS) + ' ' + R(NOMS);
  return { key:'license:'+hex(40), name:nom, sid:I(2,180),
           discord:'discord:'+I(100000000000000000,999999999999999999),
           steam:'steam:11000010'+hex(8), job:R(['LSPD','EMS','Mécano','Taxi','Sans emploi','Pêcheur']), grade:I(0,5) };
});
const staff = ['Nyx','Vortex','Kaleb','Orion'].map(n => ({ key:'license:'+hex(40), name:n, staff:true }));

const M = [
  [10,'connexions','info',   (a)=>[`${a.name} a rejoint le serveur`,{kind:'join',serverId:a.sid,ping:I(24,120)+' ms',identifiants:{license:a.key,discord:a.discord}},'origin_core']],
  [8, 'connexions','info',   (a)=>[`${a.name} s'est déconnecté`,{kind:'leave',raison:R(['Exited','Timed out','Client crashed']),session:I(12,340)+' min'},'origin_core']],
  [16,'chat','info',         (a)=>[`${a.name} : « ${R(['on se retrouve au garage','j’ai besoin d’un mécano sur Route 68','la police est déjà passée','ramène le van'])} »`,{kind:'chat',zone:R(ZONES)},'origin_chat']],
  [7, 'combat','notice',     (a,b)=>[`${a.name} a éliminé ${b.name}`,{kind:'kill',arme:R(ARMES),distance:I(2,140)+' m',victime:b.name},'origin_medical',b]],
  [5, 'combat','info',       (a)=>[`${a.name} est mort`,{kind:'death',cause:R(['chute','collision','noyade'])},'origin_medical']],
  [11,'economie','info',     (a)=>{const n=I(50,9000);return [`${a.name} a retiré ${money(n)} au distributeur`,{kind:'money',compte:'bank',montant:n},'origin_banking'];}],
  [5, 'economie','info',     (a,b)=>{const n=I(200,25000);return [`${a.name} a viré ${money(n)} à ${b.name}`,{kind:'money',montant:n,vers:b.name},'origin_banking',b];}],
  [9, 'inventaire','info',   (a,b)=>{const q=I(1,10);return [`${a.name} a donné ${q}× ${R(ITEMS)} à ${b.name}`,{kind:'swap',item:R(ITEMS),quantite:q,vers:b.name},'ox_inventory',b];}],
  [8, 'vehicules','info',    (a)=>[`${a.name} a sorti ${R(VEHS)} du garage`,{kind:'garage_out',modele:R(VEHS),plaque:hex(2).toUpperCase()+I(10,99)+'ABC',carburant:I(20,100)+'%'},'origin_garage']],
  [4, 'jobs','info',         (a)=>[`${a.name} a pris son service — ${a.job}`,{kind:'duty',job:a.job,grade:a.grade},'origin_jobs']],
  [3, 'proprietes','info',   (a)=>{const n=I(2500,18000);return [`${a.name} a payé son loyer — ${money(n)}`,{kind:'rent',loyer:n},'origin_housing'];}],
  [3, 'braquages','alerte',  (a)=>[`${a.name} a lancé le braquage de ${R(BANQUES)}`,{kind:'start',cible:R(BANQUES),equipe:I(2,6),niveauAlerte:I(1,5)},'origin_heists']],
  [4, 'drogue','notice',     (a,b)=>{const n=I(400,9000);return [`${a.name} a vendu de la marchandise à ${b.name} — ${money(n)}`,{kind:'deal',montant:n,zone:R(ZONES)},'origin_drugs',b];}],
  [3, 'organisations','notice',(a)=>{const q=I(1,30);return [`${a.name} a retiré ${q}× ${R(ITEMS)} du coffre des ${R(['Ballas','Vagos','Families'])}`,{kind:'stash_out',quantite:q},'origin_gangs'];}],
  [3, 'craft','alerte',      (a)=>[`${a.name} a fabriqué ${R(ARMES)}`,{kind:'craft_weapon',arme:R(ARMES),etabli:'l’atelier du port'},'origin_craft']],
  [4, 'admin','notice',      (a,b,s)=>[`${s.name} a fait apparaître ${R(VEHS)}`,{kind:'spawn',modele:R(VEHS),motif:'test'},'txAdmin',null,s]],
  [3, 'anticheat','alerte',  (a)=>[`Téléportation anormale — ${a.name}`,{kind:'flag',detection:'position_delta',distance:I(400,4200)+' m',duree:'0,2 s'},'origin_guard']],
  [1, 'anticheat','critique',(a)=>[`Injection de ressource détectée — ${a.name}`,{kind:'flag',detection:'resource_injection',ressource:R(['eulen','redengine','lynx'])},'origin_guard']],
  [2, 'sanctions','notice',  (a,b,s)=>[`${s.name} a averti ${a.name} — ${R(MOTIFS)}`,{kind:'warn',type:'warn',cible:a.name,cibleKey:a.key,motif:R(MOTIFS),staff:s.name},'origin_admin',a,s]],
  [2, 'bans','alerte',       (a,b,s)=>{const j=I(2,30);return [`${s.name} a banni ${a.name} pour ${j} jours`,{kind:'ban',type:'ban',cible:a.name,cibleKey:a.key,motif:R(MOTIFS),duree:j+' jour(s)',expireAt:Date.now()+j*86400000,staff:s.name},'origin_admin',a,s];}],
  [1, 'bans','critique',     (a,b,s)=>[`${s.name} a banni ${a.name} définitivement`,{kind:'ban',type:'ban',cible:a.name,cibleKey:a.key,motif:'Cheat détecté — menu illégal',duree:'permanent',expireAt:null,staff:s.name},'origin_admin',a,s]],
  [1, 'bans','info',         (a,b,s)=>[`${s.name} a levé le bannissement de ${a.name}`,{kind:'unban',type:'unban',cible:a.name,cibleKey:a.key,motif:'appel accepté',staff:s.name},'origin_admin',a,s]],
  [2, 'staff','notice',      (a,b)=>[`${a.name} a signalé ${b.name} — ${R(MOTIFS)}`,{kind:'report',ticket:'#'+I(400,999),vise:b.name},'origin_reports',b]],
  [2, 'whitelist','info',    (a,b,s)=>[`${s.name} a accepté la candidature de ${a.name}`,{kind:'accept',candidat:a.name,staff:s.name},'origin_whitelist',null,s]],
  [2, 'systeme','info',      ()=>[`Sauvegarde de la base terminée`,{kind:'backup',duree:I(2,40)+' s',taille:I(40,900)+' Mo'},'origin_core',null,{name:'Système',staff:true}]]
];
const SAC = []; M.forEach((m, i) => { for (let k = 0; k < m[0]; k++) SAC.push(i); });
const POIDS_H = [.55,.40,.25,.15,.10,.08,.10,.15,.22,.30,.38,.45,.50,.50,.55,.60,.68,.78,.90,1,1,.95,.85,.70];

const events = [];
let garde = 0;
while (events.length < N && garde++ < N * 40) {
  const t = Date.now() - Math.floor(Math.random() * 7 * 86400000);
  if (Math.random() > POIDS_H[new Date(t).getHours()]) continue;
  const m = M[R(SAC)];
  let a = R(joueurs), b = R(joueurs); while (b === a) b = R(joueurs);
  const s = R(staff);
  const [msg, data, res, cible, acteur] = m[3](a, b, s);
  events.push({ ts:t, cat:m[1], sev:m[2], msg, data, res,
                actor: acteur || a, target: cible || null });
}

(async () => {
  let envoyes = 0;
  for (let i = 0; i < events.length; i += 200) {
    const lot = events.slice(i, i + 200);
    const r = await fetch(URL_API + '/api/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-origin-key': KEY },
      body: JSON.stringify({ server: 'origin-demo', events: lot })
    });
    if (!r.ok) { console.error('\n  Refusé par l’API (' + r.status + ') — vérifiez SERVER_KEY et que le serveur tourne.\n'); process.exit(1); }
    envoyes += (await r.json()).recus || 0;
  }
  console.log(`\n  ${envoyes} évènements déposés sur ${URL_API}`);
  console.log('  Ouvrez le panneau : les 19 catégories doivent se remplir.\n');
})().catch(e => { console.error('\n  ' + e.message + '\n'); process.exit(1); });
