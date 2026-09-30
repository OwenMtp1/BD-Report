// Le branchement d'un serveur de jeu en une commande.
// ⚠️ Ce chemin-là est le SEUL que le client parcourt seul, sans nous.
// Tout ce qu'il ne vérifie pas ici se découvre chez lui, au téléphone.
const B = process.env.BASE;
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
const T=[];const t=(n,ok,x='')=>{T.push([ok,n]);console.log((ok?'  ok    ':'  ÉCHEC ')+n+(x?'  → '+x:''));};
const sect=n=>console.log('\n── '+n+' '+'─'.repeat(Math.max(0,54-n.length)));
let ck='';
const J=async(p,o={},c)=>{const r=await fetch(B+p,{redirect:'manual',...o,headers:{'content-type':'application/json',cookie:c!==undefined?c:ck,...(o.headers||{})}});
  return {status:r.status, body:await r.json().catch(()=>null), r};};
const txt=async p=>{const r=await fetch(B+p);return {status:r.status, body:await r.text()};};

const login = async (pseudo, mdp) => {
  const r = await fetch(B+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({pseudo,password:mdp})});
  return (r.headers.get('set-cookie')||'').split(';')[0];
};
ck = await login('Sup','motdepassesup12345');

sect('Le script d’installation est public et complet');
const sc = await txt('/install');
t('GET /install répond en clair', sc.status===200 && sc.body.startsWith('#!'), sc.status+'');
t('il porte l’adresse du panneau', sc.body.includes(B), B);
t('il appelle /api/enroll pour échanger le code', sc.body.includes('/api/enroll'));
t('il pose la ressource sous resources/origin_logs', sc.body.includes('resources'));
// ⚠️ Les deux pièges du produit. Un script qui les referait à notre place
// serait pire que la documentation qui les explique.
t('⚠️ il écrit la clé dans secrets.cfg, et rien dans config.lua',
  sc.body.includes('secrets.cfg') && !/>>\s*"?\$?\{?\w*config\.lua/.test(sc.body));
t('⚠️ et jamais « setr », qui répliquerait la clé chez les joueurs',
  /set origin_logs_key/.test(sc.body) && !/setr\s+origin_logs/.test(sc.body));
t('le fichier de clés est illisible aux autres', sc.body.includes('chmod 600'));
t('server.cfg est sauvegardé avant d’être modifié', sc.body.includes('.origin-logs.bak'));
t('il rappelle la commande de vérification', sc.body.includes('origin_logs_test'));

sect('Un code, pas une clé');
const sp = await J('/api/platform/spaces',{method:'POST',body:JSON.stringify(
  {nom:'Client Branchement',guildId:'555000444',staffRoleId:'900004'})});
const ID = sp.body.id, CLE = sp.body.cle;
t('espace créé', sp.body.ok===true, 'espace #'+ID);

const avant = (await J('/api/platform/spaces')).body.spaces.find(x=>x.id===ID);
t('il commence « jamais branché »', !avant.brancheLe && !avant.codeBranchement);

const br = await J('/api/platform/spaces/'+ID+'/branchement',{method:'POST'});
t('on émet un code', br.status===200 && /^ORG-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(br.body.code||''), br.body.code);
t('sans I, L, O, U, 0 ni 1 — un code se dicte au téléphone',
  !/[ILOU01]/.test(br.body.code.slice(4)), br.body.code);
t('la commande est rendue toute faite',
  br.body.commande === 'bash <(curl -fsSL '+B+'/install) '+br.body.code, br.body.commande);
t('⚠️ la commande ne contient PAS la clé d’ingestion', !br.body.commande.includes(CLE));
t('elle périme', br.body.expire > Date.now() && br.body.expire < Date.now()+1000*3600*24);

const pendant = (await J('/api/platform/spaces')).body.spaces.find(x=>x.id===ID);
t('la fiche porte le code tant qu’il vaut', pendant.codeBranchement===br.body.code);

sect('Le client consomme le code');
const faux = await J('/api/enroll',{method:'POST',body:JSON.stringify({code:'ORG-XXXX-XXXX'})},'');
t('un code inconnu est refusé', faux.status===404, faux.body&&faux.body.error);

const ok1 = await J('/api/enroll',{method:'POST',body:JSON.stringify({code:br.body.code})},'');
t('le bon code est accepté sans être connecté', ok1.status===200);
t('il rend la clé de CET espace', ok1.body.cle===CLE);
t('et son nom, pour origin_logs_name', ok1.body.nom==='Client Branchement', ok1.body.nom);
t('et l’adresse à viser', typeof ok1.body.url==='string' && ok1.body.url.startsWith('http'), ok1.body.url);
t('la liste des fichiers à télécharger est donnée',
  Array.isArray(ok1.body.fichiers) && ok1.body.fichiers.includes('fxmanifest.lua')
  && ok1.body.fichiers.includes('config.lua'), (ok1.body.fichiers||[]).length+' fichiers');
t('⚠️ y compris le fichier serveur, celui qui porte la clé',
  ok1.body.fichiers.includes('server/config_serveur.lua'));
t('⚠️ et rien d’autre que du code', ok1.body.fichiers.every(f=>/\.(lua|json)$/.test(f)),
  ok1.body.fichiers.filter(f=>!/\.(lua|json)$/.test(f)).join(', '));

// ⚠️ C'est ici que tout se joue : le script télécharge par HTTP ce que
// cette liste annonce. Un fichier listé mais non servi casse l'install
// chez le client, pas chez nous.
let servis = 0, manquants = [];
for (const f of ok1.body.fichiers) {
  const r = await txt('/resource/'+f);
  if (r.status===200 && r.body.length) servis++; else manquants.push(f);
}
t('⚠️ chaque fichier annoncé est réellement servi', manquants.length===0,
  manquants.length ? manquants.join(', ') : servis+' fichiers téléchargeables');

sect('Un code ne vaut qu’une fois');
const rejeu = await J('/api/enroll',{method:'POST',body:JSON.stringify({code:br.body.code})},'');
t('⚠️ le rejouer est refusé', rejeu.status===404, rejeu.body&&rejeu.body.error);
const apres = (await J('/api/platform/spaces')).body.spaces.find(x=>x.id===ID);
t('la fiche passe à « branché »', !!apres.brancheLe && !apres.codeBranchement);

sect('La clé délivrée ouvre bien cet espace, et lui seul');
const dep = await fetch(B+'/api/ingest',{method:'POST',
  headers:{'content-type':'application/json','x-origin-key':ok1.body.cle},
  body:JSON.stringify([{cat:'admin',msg:'branchement vérifié'}])});
const depJ = await dep.json();
t('un dépôt passe avec la clé reçue', dep.status===200 && depJ.recus===1, JSON.stringify(depJ));
t('et il arrive dans le bon espace', depJ.espace==='Client Branchement', depJ.espace);

sect('Qui peut brancher');
const ckNyx = await login('Nyx','motdepassetest123');
const interdit = await J('/api/platform/spaces/'+ID+'/branchement',{method:'POST'},ckNyx);
t('⚠️ un fondateur ordinaire n’émet pas de code', interdit.status===403||interdit.status===404,
  interdit.status+'');
const anonyme = await J('/api/platform/spaces/'+ID+'/branchement',{method:'POST'},'');
t('⚠️ ni un inconnu', anonyme.status===401||anonyme.status===403, anonyme.status+'');

sect('Un espace fermé ne se branche pas');
const br2 = await J('/api/platform/spaces/'+ID+'/branchement',{method:'POST'});
await J('/api/platform/spaces/'+ID,{method:'PATCH',body:JSON.stringify({etat:'ferme',motif:'test'})});
const surFerme = await J('/api/enroll',{method:'POST',body:JSON.stringify({code:br2.body.code})},'');
t('⚠️ un code valide sur un espace fermé est refusé', surFerme.status===409,
  surFerme.body&&surFerme.body.error);
const emettreFerme = await J('/api/platform/spaces/'+ID+'/branchement',{method:'POST'});
t('et on n’en émet plus pour lui', emettreFerme.status===409, emettreFerme.body&&emettreFerme.body.error);
await J('/api/platform/spaces/'+ID,{method:'PATCH',body:JSON.stringify({etat:'actif'})});
const annule = await J('/api/platform/spaces/'+ID+'/branchement',{method:'DELETE'});
t('un code se révoque avant usage', annule.status===200);
const apresAnnul = (await J('/api/platform/spaces')).body.spaces.find(x=>x.id===ID);
t('et il disparaît de la fiche', !apresAnnul.codeBranchement);

sect('Le script, exécuté pour de vrai sur un faux serveur FiveM');
// ⚠️ Lire le script ne prouve rien : ce qui compte est ce qu'il DÉPOSE.
// On lui fabrique donc un serveur de jeu complet dans un dossier jetable
// et on regarde le résultat, fichier par fichier.
const FAUX = mkdtempSync(path.join(tmpdir(), 'faux-fivem-'));
mkdirSync(path.join(FAUX, 'resources'), { recursive: true });
writeFileSync(path.join(FAUX, 'server.cfg'),
  'endpoint_add_tcp "0.0.0.0:30120"\nsv_maxclients 48\nensure mapmanager\n');
writeFileSync(path.join(FAUX, 'install.sh'), sc.body);

const brE2E = await J('/api/platform/spaces/'+ID+'/branchement',{method:'POST'});
const lancer = code => execFileSync('bash', [path.join(FAUX,'install.sh'), code, path.join(FAUX,'server.cfg')],
  { encoding:'utf8', env:{...process.env, NO_PROXY:'127.0.0.1,localhost', no_proxy:'127.0.0.1,localhost'} });
let sortie = '';
try { sortie = lancer(brE2E.body.code); }
catch (e) { sortie = String((e.stdout||'') + (e.stderr||'')); }
t('le script va jusqu’au bout', /Terminé/.test(sortie), sortie.trim().split('\n').pop());

const RES = path.join(FAUX, 'resources', 'origin_logs');
t('la ressource est posée au bon nom', existsSync(path.join(RES, 'fxmanifest.lua')));
t('avec ses sous-dossiers', existsSync(path.join(RES, 'server', 'config_serveur.lua'))
  && existsSync(path.join(RES, 'client')));

const secrets = existsSync(path.join(FAUX,'secrets.cfg')) ? readFileSync(path.join(FAUX,'secrets.cfg'),'utf8') : '';
t('la clé est dans secrets.cfg', secrets.includes('set origin_logs_key  "'+CLE+'"'));
t('avec l’adresse et le nom de l’espace',
  secrets.includes('origin_logs_url') && secrets.includes('Client Branchement'));
t('⚠️ en « set », jamais « setr »', /set origin_logs_key/.test(secrets) && !/setr/.test(secrets));
t('⚠️ et le fichier n’est lisible que par son propriétaire',
  (statSync(path.join(FAUX,'secrets.cfg')).mode & 0o077) === 0,
  '0' + (statSync(path.join(FAUX,'secrets.cfg')).mode & 0o777).toString(8));

const cfg = readFileSync(path.join(FAUX,'server.cfg'),'utf8');
t('server.cfg charge secrets.cfg', /^exec secrets\.cfg$/m.test(cfg));
t('et lance la ressource', /^ensure origin_logs$/m.test(cfg) && /^ensure baseevents$/m.test(cfg));
t('⚠️ sans jamais y écrire la clé', !cfg.includes(CLE));
t('il garde ce qui était déjà là', cfg.includes('ensure mapmanager') && cfg.includes('sv_maxclients 48'));
t('et une copie de l’original', existsSync(path.join(FAUX,'server.cfg.origin-logs.bak')));
t('⚠️ la clé n’est PAS dans config.lua, téléchargé par chaque joueur',
  !readFileSync(path.join(RES,'config.lua'),'utf8').includes(CLE));

// ⚠️ Un client relance la commande — pour changer de machine, ou parce
// qu'il n'est pas sûr que ça ait marché. Deux `ensure origin_logs` dans
// un server.cfg, c'est la ressource démarrée deux fois.
const br2E2E = await J('/api/platform/spaces/'+ID+'/branchement',{method:'POST'});
try { lancer(br2E2E.body.code); } catch { /* le verdict est dans les fichiers */ }
const cfg2 = readFileSync(path.join(FAUX,'server.cfg'),'utf8');
const compte = (s, re) => (s.match(re)||[]).length;
t('⚠️ rejouer la commande ne duplique rien',
  compte(cfg2,/^ensure origin_logs$/mg)===1 && compte(cfg2,/^exec secrets\.cfg$/mg)===1,
  compte(cfg2,/^ensure origin_logs$/mg)+' ensure, '+compte(cfg2,/^exec secrets\.cfg$/mg)+' exec');
t('ni ne double la clé dans secrets.cfg',
  compte(readFileSync(path.join(FAUX,'secrets.cfg'),'utf8'), /^set origin_logs_key/mg)===1);
rmSync(FAUX, { recursive:true, force:true });

sect('⚠️ Le panneau est servi depuis la racine : ce qui ne doit pas sortir');
// api/ et bot/ sont dans l'arborescence servie. Sans filtre, un simple
// GET rendait le jeton du bot ou la base elle-même.
for (const [chemin, quoi] of [['/api/.env','les secrets de l’API'],
                              ['/bot/.env','le jeton du bot Discord'],
                              ['/api/data/origin-logs.db','la base de données'],
                              ['/api/server.js','le code serveur'],
                              ['/.git/config','le dépôt git']]) {
  const r = await txt(chemin);
  const fuite = r.status===200 && !/^\s*<!/.test(r.body) && !/"error"/.test(r.body);
  t('⚠️ ' + chemin + ' ne rend pas ' + quoi, !fuite, r.status+' · '+r.body.slice(0,40));
}
const pub = await txt('/resource/config.lua');
t('mais la ressource, elle, reste téléchargeable', pub.status===200 && pub.body.includes('Config'),
  pub.status+'');

sect('Frein sur les essais de code');
let refus = 0;
for (let i = 0; i < 14; i++) {
  const r = await J('/api/enroll',{method:'POST',body:JSON.stringify({code:'ORG-AAAA-AAA'+i})},'');
  if (r.status===429) refus++;
}
t('⚠️ deviner un code court coûte cher', refus > 0, refus+' refus sur 14 essais');

const ko=T.filter(x=>!x[0]);
console.log('\n  '+(T.length-ko.length)+'/'+T.length+' contrôles passés');
if (ko.length) { console.log('\n  Échecs :'); ko.forEach(x=>console.log('   · '+x[1])); process.exit(1); }
