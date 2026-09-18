// Un Discord de contrôle : il retient ce qu'on lui poste, et sait refuser
// comme le vrai (429 avec un délai, 403 sur un salon interdit).
'use strict';
const http = require('node:http');

function creer() {
  const etat = { salons: [], messages: [], prochain: 1, quota: 0, interdits: new Set() };
  const srv = http.createServer((req, res) => {
    let corps = '';
    req.on('data', c => corps += c);
    req.on('end', () => {
      const rep = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (!/^Bot /.test(req.headers.authorization || '')) return rep(401, { message: 'Unauthorized' });
      const u = req.url;
      if (u === '/api/v10/users/@me') {
        const j = String(req.headers.authorization || '').slice(4);
        return rep(200, { id: j.slice(0, 6), username: 'Bot-' + j.slice(13, 16) });
      }
      if (/^\/api\/v10\/guilds\/\d+$/.test(u)) return rep(200, { id: u.split('/').pop(), name: 'Origin RP' });
      // ⚠️ LES SALONS APPARTIENNENT À UN SERVEUR. Sans cette séparation, le
      // second client aurait retrouvé les salons du premier PAR LEUR NOM et
      // s'en serait servi : deux serveurs Discord partageant #anticheat,
      // c'est-à-dire la fuite que le cloisonnement doit empêcher.
      const mg = u.match(/^\/api\/v10\/guilds\/(\d+)\/channels$/);
      if (mg && req.method === 'GET') return rep(200, etat.salons.filter(c => c.guild_id === mg[1]));
      if (mg && req.method === 'POST') {
        const b = JSON.parse(corps || '{}');
        const c = { id: String(1000 + etat.prochain++), guild_id: mg[1], name: b.name, type: b.type,
                    parent_id: b.parent_id || null, topic: b.topic };
        etat.salons.push(c); return rep(201, c);
      }
      const m = u.match(/^\/api\/v10\/channels\/(\d+)\/messages$/);
      if (m && req.method === 'POST') {
        if (etat.interdits.has(m[1])) return rep(403, { message: 'Missing Access' });
        if (etat.quota > 0) { etat.quota--; return rep(429, { retry_after: 0.05, message: 'rate limited' }); }
        const b = JSON.parse(corps || '{}');
        etat.messages.push({ salon: m[1], content: b.content || null, embeds: b.embeds || [], mentions: b.allowed_mentions });
        return rep(200, { id: String(etat.messages.length) });
      }
      rep(404, { message: 'Unknown route' });
    });
  });
  srv.etat = etat;
  return srv;
}
module.exports = { creer };
