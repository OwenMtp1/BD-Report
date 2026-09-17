// ============================================================
// Origin Logs — un évènement devient un message Discord
//
// ⚠️ UN SALON DISCORD N'EST PAS UN TERMINAL. Verser une ligne brute par
// évènement donne un mur illisible que personne ne relit. On groupe par
// rubrique, on met la gravité en couleur, et on garde le message COURT :
// le détail vit dans le panneau, et le lien y mène. Le salon sert à
// savoir qu'il s'est passé quelque chose, pas à mener l'enquête.
// ============================================================
'use strict';

// Les couleurs des gravités, reprises du panneau pour que l'œil ne
// réapprenne rien en passant de l'un à l'autre.
const COULEURS = {
  critique: 0xFF4365,
  alerte:   0xF5A524,
  notice:   0x6EA8FF,
  info:     0x9084AC
};
const PUCES = { critique: '🔴', alerte: '🟠', notice: '🔵', info: '⚪' };

// Discord refuse au-delà de 100 caractères, et n'accepte ni majuscules ni
// espaces dans un nom de salon : il les remplace lui-même, ce qui donne
// des noms qu'on ne reconnaît plus. On les compose donc nous-mêmes.
function nomSalon(prefixe, label) {
  const base = String(label).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (String(prefixe || '') + base).slice(0, 90) || 'logs';
}

const horodate = ts => new Date(ts).toISOString();

// Une ligne de résumé, quand la rubrique est trop bavarde pour tout dire.
const ligne = e => `${PUCES[e.sev] || '⚪'} \`${new Date(e.ts).toLocaleTimeString('fr-FR')}\` ${tronquer(e.msg, 120)}`;

function tronquer(t, n) {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// Les champs de la charge utile qui méritent d'être montrés. On en prend
// peu : un embed de vingt champs ne se lit pas mieux qu'un mur de texte.
function champs(e) {
  const out = [];
  const d = e.data || {};
  if (e.acteur && e.acteur.nom)
    out.push({ name: e.acteur.staff ? 'Staff' : 'Joueur',
               value: `${e.acteur.nom}${e.acteur.sid != null ? ` \`[${e.acteur.sid}]\`` : ''}`, inline: true });
  if (e.cible && e.cible.nom) out.push({ name: 'Concerne', value: e.cible.nom, inline: true });
  let n = 0;
  for (const [k, v] of Object.entries(d)) {
    if (n >= 4) break;
    if (v == null || typeof v === 'object' || k === 'kind') continue;
    out.push({ name: tronquer(k, 24), value: '`' + tronquer(String(v), 60) + '`', inline: true });
    n++;
  }
  return out.slice(0, 8);
}

function embed(e, rubrique, espace) {
  return {
    color: COULEURS[e.sev] != null ? COULEURS[e.sev] : COULEURS.info,
    author: { name: `${rubrique.code} · ${rubrique.label}` },
    description: tronquer(e.msg, 500),
    fields: champs(e),
    footer: { text: `${espace} · ${e.res || 'origin_logs'} · #${e.id}` },
    timestamp: horodate(e.ts)
  };
}

/* Un lot d'évènements d'UNE rubrique devient un ou plusieurs messages.
   ⚠️ Discord plafonne à 10 embeds par message. Au-delà du seuil, on
   RÉSUME au lieu de détailler : trente embeds pour trente ouvertures
   d'inventaire n'apprennent rien et coûtent six messages. */
function messages(lot, rubrique, espace, cfg) {
  if (!lot.length) return [];
  const ping = cfg.rolePing && lot.some(e => cfg.pingSur.includes(e.sev))
    ? `<@&${cfg.rolePing}> ` : '';

  if (lot.length <= cfg.maxParSalon) {
    const out = [];
    for (let i = 0; i < lot.length; i += 10) {
      const tranche = lot.slice(i, i + 10);
      out.push({
        content: i === 0 && ping ? ping.trim() : undefined,
        embeds: tranche.map(e => embed(e, rubrique, espace)),
        allowed_mentions: ping ? { roles: [cfg.rolePing] } : { parse: [] }
      });
    }
    return out;
  }

  // Trop nombreux : un résumé, et le détail des plus graves seulement.
  const graves = lot.filter(e => e.sev === 'critique' || e.sev === 'alerte').slice(0, 5);
  const corps = lot.slice(0, 12).map(ligne).join('\n');
  const msg = {
    content: (ping ? ping : '') +
      `**${lot.length} évènements** dans « ${rubrique.label} »` +
      (graves.length ? ` — dont ${graves.length} à regarder` : ''),
    embeds: [{
      color: graves.length ? COULEURS.alerte : COULEURS.info,
      description: corps + (lot.length > 12 ? `\n…et ${lot.length - 12} de plus.` : ''),
      footer: { text: `${espace} · résumé — le détail est dans le panneau` }
    }].concat(graves.map(e => embed(e, rubrique, espace))).slice(0, 10),
    allowed_mentions: ping ? { roles: [cfg.rolePing] } : { parse: [] }
  };
  return [msg];
}

module.exports = { nomSalon, messages, embed, COULEURS, PUCES, tronquer };
