// L'INTERFACE, FIGÉE PAR SES DÉCISIONS.
// ⚠️ Ces défauts-là ne cassent aucun test : l'API répond juste, les pages
// s'affichent, et pourtant l'écran devient inutilisable — une liste qui
// bouge sous les yeux, un rail qui cache la moitié de ses rubriques, un
// texte sous le seuil de lisibilité. On ne peut pas les vérifier sans
// navigateur ; on peut vérifier que le CODE qui les corrige est toujours
// là, et c'est ce qui compte le jour d'une refonte.
import { readFileSync } from 'node:fs';
import path from 'node:path';
const T=[];const t=(n,ok,x='')=>{T.push([ok,n]);console.log((ok?'  ok    ':'  ÉCHEC ')+n+(x?'  → '+x:''));};
const sect=n=>console.log('\n── '+n+' '+'─'.repeat(Math.max(0,54-n.length)));

const P = readFileSync(path.join(process.cwd(), '..', 'panel.html'), 'utf8');
const bloc = (re) => { const m = P.match(re); return m ? m[0] : ''; };

sect('Contraste : les jetons tiennent le seuil AA');
const lum = h => { const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255)
  .map(v=>v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)); return .2126*c[0]+.7152*c[1]+.0722*c[2]; };
const ratio = (a,b) => { const l1=lum(a),l2=lum(b); return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05); };
const jeton = n => (P.match(new RegExp('--' + n + ':\\s*(#[0-9A-Fa-f]{6})')) || [])[1];
const FONDS = ['ground','panel','panel-2','raise'].map(jeton);
t('les quatre fonds sont déclarés', FONDS.every(Boolean), FONDS.join(' '));
for (const nom of ['ink', 'ink-2', 'muted']) {
  const c = jeton(nom);
  const pire = Math.min(...FONDS.map(f => ratio(c, f)));
  t(`--${nom} lisible sur le pire fond`, pire >= 4.5, c + ' → ' + pire.toFixed(2) + ':1');
}
t('⚠️ --muted porte la moitié du texte : c’est LUI qui manquait',
  ratio(jeton('muted'), jeton('raise')) >= 4.5,
  'était #7B6C95 (3,55:1), désormais ' + jeton('muted'));

sect('Le direct n’insère plus sous les yeux');
t('⚠️ le garde-fou interroge le flux, PAS la fenêtre',
  /feedAuHaut[\s\S]{0,140}#feedScroll/.test(P) && !/window\.scrollY < 200/.test(P),
  /window\.scrollY < 200/.test(P) ? 'window.scrollY encore présent' : 'lit #feedScroll');
t('ce qui arrive pendant la lecture ATTEND', /STATE\.enAttente\.unshift\(e\)/.test(P));
t('et une pastille le dit', /id="feedNew"/.test(P) && /majPastilleNeufs/.test(P));
t('le clic la libère sans doublon', /function prendreNeufs/.test(P) && /deja\.has\(e\.id\)/.test(P));
t('⚠️ le rafraîchissement de FOND ne l’efface pas',
  /refresh\(\{ fond:true \}\)/.test(P) && /opts && opts\.fond/.test(P));
t('et un nouveau rendu ne déplace pas la ligne lue',
  /poserAncre/.test(P) && /f\.scrollHeight - ancre\.total/.test(P));

sect('Le rail montre tout ce qu’il contient');
const cssRail = bloc(/\.rail\{[^}]*\}/);
const cssNav  = bloc(/\n\.nav\{[^}]*\}/);
t('⚠️ c’est la LISTE qui défile, pas le rail entier',
  /overflow:hidden/.test(cssRail) && /overflow-y:auto/.test(cssNav), cssNav.trim().slice(0,60));
t('le pied reste épinglé', /\.rail-foot\{flex:none/.test(P));
t('un dégradé annonce la suite', /id="railMore"/.test(P) && /function jaugerRail/.test(P));
t('et il disparaît une fois en bas', /more\.classList\.toggle\('on', reste > 8\)/.test(P));

sect('Mobile : les rubriques gardent leur nom');
const mob = bloc(/@media \(max-width:900px\)\{[\s\S]*?\n\}/);
t('⚠️ le libellé n’est plus masqué', !/\.nav-item \.nav-label\{display:none\}/.test(mob));
t('il est explicitement rendu', /\.nav-item \.nav-label\{display:block/.test(mob));

sect('Un bandeau qui ne change pas de hauteur');
const cssBar = bloc(/\n\.bar\{[^}]*\}/);
t('⚠️ il ne se replie plus', /flex-wrap:nowrap/.test(cssBar));
t('sa hauteur est fixe', /height:var\(--bar-h\)/.test(cssBar) && !/min-height:var\(--bar-h\)/.test(cssBar));
t('le repli revient sous 900 px, où il n’y a plus le choix',
  /\.bar\{height:auto;min-height:var\(--bar-h\);flex-wrap:wrap/.test(mob));
t('⚠️ et la croix pour RESSORTIR ne se tronque jamais',
  /class="tag-nom"/.test(P) && /\.tag-x\{flex:none/.test(P));

sect('La recherche dit pourquoi une ligne répond');
t('le terme visible est surligné', /function surligner/.test(P) && /fmtMsg\(e, STATE\.q\)/.test(P));
t('⚠️ et le champ de la charge utile est NOMMÉ quand il ne se voit pas',
  /function indiceCharge/.test(P) && /indiceCharge\(e, STATE\.q\)/.test(P));
t('accents et casse ignorés', /sansAccents/.test(P));
t('le surlignage ne touche pas au balisage', /replace\(\/>\(\[\^<\]\+\)<\/g/.test(P));

sect('Le reste de la liste');
t('les compteurs du rail se chargent dès l’entrée', /chargerComptesRail/.test(P));
t('un mode compact existe et se souvient',
  /basculerDensite/.test(P) && /origin_densite/.test(P) && /\.feed\.compact \.ev\{/.test(P));
t('le code de rubrique se laisse lire', /title="\$\{esc\(cat\.label\)\}"/.test(P));
t('⚠️ la file d’alertes montre l’ÂGE, pas une heure sans date',
  /class="lite-m" title="\$\{new Date\(e\.t\)\.toLocaleString/.test(P));
t('aucun « charger plus » sous une liste vide',
  /\$\('#moreBtn'\)\.hidden = true;\n    \$\('#feedNew'\)\.hidden = true;/.test(P));
t('⚠️ bannir et effacer ne se ressemblent plus', /\.btn\.grave\{/.test(P) && /btn sm grave" data-rgpd="effacer/.test(P));
t('la coche « traité » atteint 24 px', /width:24px;height:24px;flex:none;border-radius:6px/.test(P));
t('un repère <main> et un titre de région', /<main id="contenu">/.test(P) && /class="sr-only" id="feedHead"/.test(P));

sect('La liste des environnements est un ONGLET, pas une fenêtre');
// ⚠️ Elle vivait dans une fenêtre modale : on l'ouvrait, on entrait
// quelque part, elle se refermait — et pour revenir au client suivant il
// fallait la rouvrir. C'est l'écran que l'administration regarde le plus.
t('la vue existe', /id="viewSpaces"/.test(P));
t('elle a son entrée dans le rail', /data-view="spaces"/.test(P));
t('et son adresse, comme les autres vues', /'\/environnements'/.test(P));
t('⚠️ le clic du rail la route vraiment — sans quoi l’onglet retombe sur la supervision',
  /dataset\.view === 'spaces'\)\s*return goVue\('spaces'\)/.test(P));
t('deux gestes distincts, pas un menu', /data-enter="\$\{sp\.id\}/.test(P) && /data-envedit="\$\{sp\.id\}/.test(P));
t('⚠️ « Entrer » n’apparaît qu’à qui en a le droit, et pas sur un espace fermé',
  /canPlat\('plat\.entrer'\) && actif/.test(P));
t('⚠️ la fiche de modification RÉUTILISE le formulaire complet',
  /carteEspace\(sp, ENVS\)/.test(P), 'un second formulaire aurait divergé');
t('ce qui manque chez un client se dit sur sa carte',
  /liaison Discord incomplète/.test(P) && /jamais branché/.test(P));

sect('Les offres se composent dans un ONGLET, avec leurs rubriques');
// ⚠️ Une offre disait un prix et des plafonds ; elle dit maintenant CE
// QU'ON ACHÈTE. Sans les rubriques, deux formules ne se distinguaient
// que par un nombre de jours, et il n'y avait rien à vendre au palier
// du dessus.
t('la vue existe', /id="viewPlans"/.test(P));
t('elle a son entrée dans le rail', /data-view="plans"/.test(P));
t('et son adresse', /'\/offres'/.test(P));
t('⚠️ le clic du rail la route vraiment — sans quoi l’onglet retombe sur la supervision',
  /dataset\.view === 'plans'\)\s*return goVue\('plans'\)/.test(P));
t('⚠️ la liste des vues de plateforme vit à UN SEUL endroit',
  /const VUES_PLATEFORME = new Set\(\[[^\]]*'plans'/.test(P)
  && !/\['platform','platformlog','spaces'\]/.test(P));
t('créer et supprimer sont là, pas seulement modifier',
  /id="offreNewBtn"/.test(P) && /data-offredel="/.test(P) && /data-offreedit="/.test(P));
t('⚠️ UN SEUL formulaire sert à créer ET à modifier',
  /function formulaireOffre\(o, nouvelle\)/.test(P)
  && (P.match(/formulaireOffre\(/g) || []).length >= 3, 'un second aurait divergé');
t('les rubriques se cochent par groupe, comme dans l’éditeur de rôles',
  /data-offrecat="/.test(P) && /GROUPS\.map\(g =>/.test(P));
t('⚠️ « toutes » n’est pas « les dix-huit cochées » — une offre haute reçoit les rubriques à venir',
  /id="ofToutes"/.test(P) && /toutes \? null/.test(P));
t('et cocher « toutes » neutralise la grille plutôt que de la laisser mentir',
  /ofToutes/.test(P) && /n\.disabled = on/.test(P));
t('une offre qui n’ouvre RIEN se confirme, elle ne se pose pas par mégarde',
  /n’ouvre AUCUNE rubrique/.test(P));
t('le nombre de rubriques se lit dans les deux sens : ouvert ET total',
  /rubrique\(s\) sur ' \+ CATS\.length/.test(P));

t('⚠️ une rubrique hors offre ne se coche pas dans un rôle — la case le DIT au lieu d’obéir sans effet',
  /const vendu = c => !d\.catsFormule/.test(P) && /vendu\(c\.id\) \? '' : 'disabled'/.test(P));
t('et le serveur envoie ce que l’offre vend', /catsFormule/.test(P));
// ⚠️ La case reste COCHÉE quand elle l'était : rétrograder l'offre ne
// doit pas effacer le rôle que le client avait composé, sinon remonter
// d'offre lui rendrait un panneau vide qu'il faudrait tout recocher.
t('une case verrouillée reste lue à l’enregistrement',
  /\.filter\(n => n\.checked\)\.map\(n => n\.dataset\[attr\]\)/.test(P));

sect('La durée de conservation se règle sur chaque environnement');
// ⚠️ Elle ne se posait qu'à la création de l'espace : un client qui la
// renégocie six semaines plus tard obligeait à passer par la console.
t('le champ est sur la fiche de l’environnement', /data-spfield="retention"/.test(P));
t('et l’enregistrement l’emporte', /retention: val\('retention'\)/.test(P));
t('⚠️ le plafond de l’offre est NOMMÉ quand il prend le dessus',
  /plafondConservation/.test(P) && /plafonne à ' \+ sp\.plafondConservation/.test(P));

const n=T.filter(([o])=>o).length;
console.log(`\n  ${n}/${T.length} contrôles passés`);
process.exit(n===T.length?0:1);
