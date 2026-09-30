'use strict';
// ============================================================
// Origin Logs — activation signée par l'éditeur
// ------------------------------------------------------------
// Objectif : que le COMPTE FONDATEUR et la CLÉ DE CHAQUE ENVIRONNEMENT
// ne puissent être créés qu'avec un jeton signé par l'éditeur (vous),
// même quand le panneau tourne sur le VPS de quelqu'un d'autre.
//
// ⚠️ HONNÊTETÉ. Le panneau tourne chez l'opérateur, qui a les droits
// root : ce verrou est un contrôle de PROVISIONING pour un opérateur
// coopératif, pas une protection contre une modification délibérée du
// code. Il rend votre autorisation OBLIGATOIRE sur le chemin normal ;
// le contourner demanderait de trafiquer sciemment le code. C'est la
// même limite que le reste de l'app (cf. RLS, « invisible du client »).
//
// Deux clés : la PRIVÉE reste chez vous (jamais dans le dépôt, jamais
// sur le VPS) ; la PUBLIQUE est posée sur le VPS (LICENCE_PUBKEY dans
// api/.env, ou la constante BAKED ci-dessous au moment de la
// distribution). SANS clé publique, AUCUN verrou : dev, tests et
// démonstration fonctionnent comme avant (c'est voulu).
//
// Algorithme : Ed25519 (node:crypto, zéro dépendance).
// Jeton : base64url(JSON) + '.' + base64url(signature).
// ============================================================
const crypto = require('node:crypto');

// L'éditeur PEUT coller ici sa clé publique (base64 SPKI) pour figer le
// verrou dans le build distribué. Laissée vide, le verrou dépend alors
// de LICENCE_PUBKEY dans l'environnement — et vide partout = pas de verrou.
const BAKED = '';

function pubB64() { return String(process.env.LICENCE_PUBKEY || BAKED || '').trim(); }
function enforced() { return !!pubB64(); }

function pubKeyObj() {
  const b = pubB64();
  if (!b) return null;
  try { return crypto.createPublicKey({ key: Buffer.from(b, 'base64'), format: 'der', type: 'spki' }); }
  catch (e) { return null; }
}

const b64u = buf => Buffer.from(buf).toString('base64url');
const unb64u = s => Buffer.from(String(s), 'base64url');

// Vérifie un jeton et rend sa charge utile, ou null si la signature ne
// correspond pas à NOTRE clé publique. Un jeton expiré est rendu avec
// `_expire: true` (l'appelant décide quoi en faire).
function verify(token) {
  const pk = pubKeyObj();
  if (!pk || typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const [p, s] = token.trim().split('.');
  let payload, sig;
  try { payload = unb64u(p); sig = unb64u(s); } catch (e) { return null; }
  let ok = false;
  try { ok = crypto.verify(null, payload, pk, sig); } catch (e) { return null; }
  if (!ok) return null;
  let obj;
  try { obj = JSON.parse(payload.toString('utf8')); } catch (e) { return null; }
  if (!obj || typeof obj !== 'object') return null;
  if (obj.exp && Date.now() > Number(obj.exp)) obj._expire = true;
  return obj;
}

// Signe une charge utile avec une clé privée PEM. Réservé à l'OUTIL
// éditeur : le serveur ne signe jamais rien (il ne détient pas la clé).
function sign(payloadObj, privateKeyPem) {
  const key = crypto.createPrivateKey(privateKeyPem);
  const payload = Buffer.from(JSON.stringify(payloadObj), 'utf8');
  const sig = crypto.sign(null, payload, key);
  return b64u(payload) + '.' + b64u(sig);
}

module.exports = { enforced, pubB64, verify, sign };

// ============================================================
// OUTIL ÉDITEUR (à lancer sur VOTRE machine, jamais sur le VPS)
//   node licence.js keygen
//   node licence.js fondateur <pseudo> <motdepasse> [joursValide]
//   node licence.js environnement "<nom de l'environnement>"
// La clé privée est écrite dans api/licence-privee.pem et NE DOIT JAMAIS
// être commitée ni copiée sur le VPS.
// ============================================================
if (require.main === module) {
  const fs = require('node:fs');
  const path = require('node:path');
  const PRIV = process.env.LICENCE_PRIVKEY_FILE || path.join(__dirname, 'licence-privee.pem');
  const cmd = process.argv[2];
  const lirePriv = () => {
    if (!fs.existsSync(PRIV)) {
      console.error('Clé privée introuvable (' + PRIV + '). Lancez d’abord : node licence.js keygen');
      process.exit(1);
    }
    return fs.readFileSync(PRIV, 'utf8');
  };

  if (cmd === 'keygen') {
    if (fs.existsSync(PRIV)) {
      console.error('Une clé privée existe déjà (' + PRIV + '). Supprimez-la d’abord pour en régénérer une — attention, tous les jetons déjà émis deviendraient invalides.');
      process.exit(1);
    }
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    fs.writeFileSync(PRIV, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
    const pub = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
    console.log('');
    console.log('  Clé privée écrite : ' + PRIV);
    console.log('  ⚠️ GARDEZ-LA hors du dépôt et hors du VPS. Elle seule signe les activations.');
    console.log('');
    console.log('  Clé PUBLIQUE — à poser sur le VPS, dans api/.env :');
    console.log('');
    console.log('    LICENCE_PUBKEY=' + pub);
    console.log('');
    console.log('  Tant que cette ligne est présente sur le VPS, le panneau exige un');
    console.log('  jeton signé pour créer le fondateur et pour chaque environnement.');
    console.log('');
  } else if (cmd === 'fondateur') {
    const pseudo = (process.argv[3] || '').trim();
    const mdp = process.argv[4] || '';
    const jours = Number(process.argv[5] || 0);
    if (pseudo.length < 3 || mdp.length < 4) {
      console.error('Usage : node licence.js fondateur <pseudo (3+)> <motdepasse (4+)> [joursValide]');
      process.exit(1);
    }
    const payload = { typ: 'fondateur', pseudo, mdp, iat: Date.now() };
    if (jours > 0) payload.exp = Date.now() + jours * 86400000;
    const token = sign(payload, lirePriv());
    console.log('');
    console.log('  Jeton d’activation FONDATEUR (à donner avec le VPS) :');
    console.log('');
    console.log('    ' + token);
    console.log('');
    console.log('  L’opérateur lance, sur le VPS :');
    console.log('    node setup.js --activation "' + '<le jeton ci-dessus>' + '"');
    console.log('  Le compte « ' + pseudo + ' » sera créé avec le mot de passe que vous avez choisi.');
    console.log('');
  } else if (cmd === 'environnement' || cmd === 'env') {
    const nom = (process.argv[3] || '').trim();
    if (nom.length < 2) {
      console.error('Usage : node licence.js environnement "<nom>"');
      process.exit(1);
    }
    const cle = crypto.randomBytes(24).toString('hex');
    const token = sign({ typ: 'env', nom, cle, iat: Date.now() }, lirePriv());
    console.log('');
    console.log('  Environnement : ' + nom);
    console.log('');
    console.log('  Jeton d’activation (à coller dans « Créer un environnement ») :');
    console.log('');
    console.log('    ' + token);
    console.log('');
    console.log('  Clé serveur incluse dans le jeton (pour info / server.cfg du jeu) :');
    console.log('    ' + cle);
    console.log('');
  } else {
    console.error([
      '',
      '  Origin Logs — activation signée (outil éditeur)',
      '',
      '    node licence.js keygen',
      '        Crée la paire de clés. La privée reste chez vous.',
      '',
      '    node licence.js fondateur <pseudo> <motdepasse> [joursValide]',
      '        Jeton qui autorise la création du compte fondateur.',
      '',
      '    node licence.js environnement "<nom>"',
      '        Jeton qui autorise un environnement + sa clé serveur.',
      ''
    ].join('\n'));
    process.exit(1);
  }
}
