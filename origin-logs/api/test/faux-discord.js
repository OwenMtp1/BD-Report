// ============================================================
// Faux Discord — juste ce que la liaison interroge réellement.
// Les tests ne doivent dépendre ni du réseau ni d'un vrai serveur
// Discord : une suite qui ne tourne que « quand Discord répond » ne
// se lance jamais au moment où elle servirait.
// ============================================================
'use strict';
const http = require('node:http');

const GUILD = '555000111';
const STAFF = '900001';
const R = { moderateur: '900010', animateur: '900011', fondateur: '900099' };

// 42 : staff + deux rôles du panneau · 43 : staff sans rôle du panneau
// 44 : rôle du panneau mais pas le rôle staff · 45 : absent du serveur
const MEMBRES = {
  '42': { roles: [STAFF, R.moderateur, R.animateur], nick: 'Nyx' },
  '43': { roles: [STAFF] },
  '44': { roles: [R.moderateur] }
};

function creer() {
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const j = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };

    // Écran d'autorisation : on accepte et on renvoie aussitôt.
    if (u.pathname === '/oauth2/authorize') {
      const back = u.searchParams.get('redirect_uri'), st = u.searchParams.get('state');
      const qui = process.env.FAUX_USER || '42';
      res.writeHead(302, { location: back + '?code=code-' + qui + '&state=' + encodeURIComponent(st) });
      return res.end();
    }
    if (u.pathname === '/api/v10/oauth2/token') {
      let b = '';
      req.on('data', c => b += c).on('end', () => {
        const code = new URLSearchParams(b).get('code');
        if (!code || !code.startsWith('code-')) return j(400, { error: 'invalid_grant' });
        j(200, { access_token: 'tok-' + code.slice(5), token_type: 'Bearer' });
      });
      return;
    }
    if (u.pathname === '/api/v10/users/@me') {
      const id = (req.headers.authorization || '').replace('Bearer tok-', '');
      return j(200, { id, username: 'user' + id, global_name: id === '42' ? 'Nyx' : 'Membre' + id, avatar: 'av' + id });
    }
    const m = u.pathname.match(/^\/api\/v10\/guilds\/(\d+)\/members\/(\d+)$/);
    if (m) {
      if (m[1] !== GUILD) return j(404, { message: 'Unknown Guild' });
      const mem = MEMBRES[m[2]];
      return mem ? j(200, { user: { id: m[2] }, roles: mem.roles, nick: mem.nick }) : j(404, { message: 'Unknown Member' });
    }
    if (u.pathname === `/api/v10/guilds/${GUILD}/roles`)
      return j(200, [{ id: STAFF, name: 'Staff', position: 10, color: 0 },
                     { id: R.moderateur, name: 'Modérateur', position: 8, color: 1 },
                     { id: R.animateur, name: 'Animateur', position: 6, color: 2 },
                     { id: R.fondateur, name: 'Fondateur', position: 20, color: 3 }]);
    j(404, { message: 'not found' });
  });
}

module.exports = { creer, GUILD, STAFF, R };
