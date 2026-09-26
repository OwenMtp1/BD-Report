// ACTIVATION SIGNÉE PAR L'ÉDITEUR.
// ⚠️ Le compte fondateur et la clé de CHAQUE environnement ne doivent
// pouvoir être créés qu'avec un jeton signé par la clé privée de
// l'éditeur. Le serveur, ici, ne connaît que la clé PUBLIQUE (verrou
// actif) ; ce test détient la PRIVÉE (LIC_PRIV) pour signer, comme le fait
// l'éditeur sur sa machine.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const crypto = require('node:crypto');
const LIC = require('../licence.js');

const B = process.env.BASE;
const PRIV = process.env.LIC_PRIV;             // clé privée éphémère (PEM)
const T=[];const t=(n,ok,x='')=>{T.push([ok,n]);console.log((ok?'  ok    ':'  ÉCHEC ')+n+(x?'  → '+x:''));};
const sect=n=>console.log('\n── '+n+' '+'─'.repeat(Math.max(0,54-n.length)));
const J=async(p,o={},c)=>{const r=await fetch(B+p,{redirect:'manual',...o,
  headers:{'content-type':'application/json',...(c!==undefined?{cookie:c}:{}),...(o.headers||{})}});
  return {status:r.status, body:await r.json().catch(()=>null)};};
const login=async(pseudo,mdp)=>{const r=await fetch(B+'/api/auth/login',{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({pseudo,password:mdp})});
  return (r.headers.get('set-cookie')||'').split(';')[0];};

// Un jeton d'environnement signé par l'éditeur, tel que produit par
// « node licence.js environnement "<nom>" ».
const jetonEnv = (nom, cle) => LIC.sign({ typ:'env', nom, cle: cle || crypto.randomBytes(24).toString('hex'), iat: Date.now() }, PRIV);

sect('Le noyau : signer, vérifier, altérer');
t('le verrou est actif (clé publique posée)', LIC.enforced());
const jFond = LIC.sign({ typ:'fondateur', pseudo:'Owen', mdp:'motdepasse', iat:Date.now() }, PRIV);
const vu = LIC.verify(jFond);
t('un jeton signé se relit', vu && vu.typ==='fondateur' && vu.pseudo==='Owen' && vu.mdp==='motdepasse');
t('⚠️ un jeton altéré est refusé', (() => {
  const [p,s]=jFond.split('.'); const mal=Buffer.from(p,'base64url').toString('utf8').replace('Owen','Pirate');
  const faux=Buffer.from(mal).toString('base64url')+'.'+s; return LIC.verify(faux)===null;
})());
t('⚠️ une signature d’une AUTRE clé est refusée', (() => {
  const autre = crypto.generateKeyPairSync('ed25519').privateKey.export({format:'pem',type:'pkcs8'});
  return LIC.verify(LIC.sign({ typ:'env', nom:'X', cle:'y', iat:Date.now() }, autre)) === null;
})());
t('un jeton expiré est signalé', (() => {
  const j = LIC.sign({ typ:'fondateur', pseudo:'A', mdp:'bbbb', iat:0, exp:Date.now()-1000 }, PRIV);
  const v = LIC.verify(j); return v && v._expire === true;
})());

sect('La création d’environnement EXIGE un jeton signé');
const sup = await login('Sup','motdepassesup12345');
t('le panneau annonce le verrou', (await J('/api/auth/me',{},sup)).body.licence.enforced===true);

const sansJeton = await J('/api/platform/spaces',{method:'POST',body:JSON.stringify({nom:'Sans jeton'})},sup);
t('⚠️ sans jeton : refus', sansJeton.status===403, 'status '+sansJeton.status);

const jetonBidon = await J('/api/platform/spaces',{method:'POST',
  body:JSON.stringify({nom:'Bidon', activation:'nimportequoi.nimportequoi'})},sup);
t('⚠️ un faux jeton : refus', jetonBidon.status===403, 'status '+jetonBidon.status);

const cleVraie = crypto.randomBytes(24).toString('hex');
const bon = await J('/api/platform/spaces',{method:'POST',
  body:JSON.stringify({nom:'ignoré', activation: jetonEnv('Los Santos RP', cleVraie)})},sup);
t('avec un jeton signé : créé', bon.status===200 && bon.body.ok, 'status '+bon.status);

// Le nom et la clé viennent du JETON, pas du corps de la requête.
const liste = await J('/api/platform/spaces',{},sup);
const cree = (liste.body.spaces||[]).find(e=>e.nom==='Los Santos RP');
t('⚠️ le nom vient du jeton, pas du champ', !!cree, cree ? cree.nom : 'introuvable');
t('⚠️ la clé d’ingestion est CELLE du jeton', cree && cree.cle===cleVraie);

const rejoue = await J('/api/platform/spaces',{method:'POST',
  body:JSON.stringify({nom:'Rejoué', activation: jetonEnv('Los Santos RP', cleVraie)})},sup);
t('⚠️ le même jeton ne sert pas deux fois', rejoue.status===409, 'status '+rejoue.status);

const expire = await J('/api/platform/spaces',{method:'POST',
  body:JSON.stringify({nom:'Expiré', activation: LIC.sign({typ:'env',nom:'Vieux',cle:crypto.randomBytes(24).toString('hex'),iat:0,exp:Date.now()-1000}, PRIV)})},sup);
t('⚠️ un jeton expiré : refus', expire.status===403, 'status '+expire.status);

const n=T.filter(([o])=>o).length;
console.log(`\n  ${n}/${T.length} contrôles passés`);
process.exit(n===T.length?0:1);
