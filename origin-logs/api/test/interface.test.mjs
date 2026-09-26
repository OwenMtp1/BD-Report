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

sect('Téléphone : le rail devient un TIROIR, plus une bande');
const mob = bloc(/@media \(max-width:900px\)\{[\s\S]*?\n\}/);
// ⚠️ Une bande horizontale de ~30 rubriques débordait la page et n'en
// montrait que trois. Le rail garde sa forme verticale riche et glisse par
// dessus le contenu, appelé par ☰.
t('⚠️ le rail passe hors-champ à gauche', /\.rail\{[^]*?position:fixed/.test(mob) && /transform:translateX\(-100%\)/.test(mob));
t('et se tire par-dessus le contenu', /\.rail\.open\{transform:none\}/.test(mob));
t('un bouton ☰ l’ouvre, réservé au téléphone', /id="navToggle"/.test(P)
  && /\.nav-toggle\{display:none\}/.test(P) && /\.nav-toggle\{display:grid\}/.test(mob));
t('un voile le referme d’un tap à côté', /id="navScrim"/.test(P) && /function fermerNav/.test(P));
t('⚠️ choisir une rubrique referme le tiroir', /if \(ev\.target\.closest\('\.nav-item'\)\) fermerNav\(\)/.test(P));
t('⚠️ le libellé des rubriques n’est jamais masqué', !/\.nav-item \.nav-label\{display:none\}/.test(mob));

sect('Un bandeau qui ne change pas de hauteur');
const cssBar = bloc(/\n\.bar\{[^}]*\}/);
t('⚠️ il ne se replie pas sur grand écran', /flex-wrap:nowrap/.test(cssBar));
t('sa hauteur est fixe', /height:var\(--bar-h\)/.test(cssBar) && !/min-height:var\(--bar-h\)/.test(cssBar));
t('⚠️ le contenu ne déborde pas latéralement en mobile', /\.main\{min-width:0;max-width:100%;overflow-x:hidden\}/.test(mob));
t('⚠️ les tuiles de KPI se réduisent à deux colonnes, puis une',
  /\.status\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/.test(mob)
  && /\.status\{grid-template-columns:1fr\}/.test(P));
// ⚠️ La barre du haut a été allégée : plus de sélecteur de période, de
// bouton « Direct », d'étiquette d'aperçu ni de bouton « Exporter ». Ils
// remontés dans une barre contextuelle EN TÊTE des écrans temporels
// (#periodBar), et le choix d'environnement est passé sur la marque.
const barHtml = bloc(/<header class="bar">[\s\S]*?<\/header>/);
t('la barre du haut (recherche) ne porte pas période / direct / export',
  !/id="rangeSeg"/.test(barHtml) && !/id="liveBtn"/.test(barHtml)
  && !/id="exportBtn"/.test(barHtml) && !/id="modeTag"/.test(barHtml));
// ⚠️ 1.6 + 3.10 : les CONTRÔLES du flux sont remontés en tête, dans une
// barre contextuelle unique (#periodBar), plus dispersés dans le pied.
t('les contrôles du flux vivent dans #periodBar, en tête',
  /id="periodBar"/.test(P) && /id="rangeSeg"/.test(P) && /id="liveBtn"/.test(P)
  && /id="exportBtn"/.test(P) && !/id="flowSettings"/.test(P));
t('#periodBar ne s’affiche que sur les écrans temporels',
  /const VUES_TEMPS = \['overview', 'stream', 'economy', 'playtime', 'stats'\]/.test(P)
  && /pb\.hidden = !\(ME\.espace && VUES_TEMPS\.includes\(STATE\.view\)\)/.test(P));
// ⚠️ 4.2 : presets étendus + plage de dates libre.
t('presets étendus (3 j, 30 j) et plage personnalisée',
  /data-range="72"/.test(P) && /data-range="720"/.test(P)
  && /id="rangeCustomBtn"/.test(P) && /function appliquerPlage/.test(P));
t('⚠️ la fenêtre passe TOUJOURS par windowFrom/windowTo/chartCfg',
  /const windowTo\s*=/.test(P) && /function chartCfg\(/.test(P)
  && !/DS\.stats\(windowFrom\(\), Date\.now\(\)/.test(P));
t('⚠️ la marque, en haut à gauche, ouvre le choix d’environnement',
  /id="brandBtn"/.test(P) && /function ouvrirEspaces/.test(P) && /btn\.onclick = cliquable \? ouvrirEspaces/.test(P));
t('et de là on RESSORT vers la plateforme', /data-sortir="1">Revenir à la plateforme/.test(P));
t('la marque ne s’ouvre que s’il y a où aller', /function peutChangerEspace/.test(P));

sect('Le profil, en haut à droite, est une carte d’identité');
t('le bloc profil s’ouvre', /id="whoBox"/.test(P) && /function ouvrirProfil/.test(P)
  && /getElementById\('whoBox'\)|\$\('#whoBox'\)\.addEventListener\('click'/.test(P));
t('il montre pseudo, Discord et environnements',
  /ligne\('Pseudo'/.test(P) && /ligne\('Discord'/.test(P) && /Environnements/.test(P));
t('⚠️ le grade ne s’affiche que si l’on en a un',
  /grade \? `<div class="who-role"/.test(P) && /grades \? ligne\('Grade staff', grades\) : ''/.test(P));
t('⚠️ se déconnecter n’ouvre pas le profil', /closest\('#logoutBtn'\)\) return/.test(P));

sect('Interactions : filtres, inspecteur, graphes, états vides');
// 1.8 — filtres retirables (déjà) + compteur de résultats.
t('les filtres actifs sont retirables un par un', /data-clear="\$\{esc\(id\)\}"/.test(P) && /data-clear="tout"/.test(P));
t('⚠️ 1.8 : le nombre de résultats est affiché', /class="af-count"/.test(P)
  && /résultat\$\{STATE\.total > 1/.test(P));
// 1.9 — inspecteur : évènement voisin (j/k) + lien copiable.
t('⚠️ 1.9 : précédent/suivant dans l’inspecteur', /data-evnav="prev"/.test(P) && /data-evnav="next"/.test(P)
  && /function voisinEvent/.test(P));
t('j / k passent d’un évènement à l’autre',
  /classList\.contains\('open'\) && \(e\.key === 'j' \|\| e\.key === 'k'\)/.test(P));
t('un lien rouvre exactement cet évènement', /id="inspLink"/.test(P) && /function copierLienEvent/.test(P)
  && /STATE\.pendingEv/.test(P));
// 4.6 — les colonnes du graphe réagissent au survol.
t('⚠️ 4.6 : survol des colonnes du graphique', /\.chart g:hover rect:not\(\.hit\)/.test(P));
// 1.3 — état vide pédagogique sur une rubrique sans logs.
t('⚠️ 1.3 : l’état vide d’une rubrique explique et pointe le branchement',
  /Rien dans « ' \+ esc\(cat\.label\)/.test(P) && /la ressource Origin Logs est bien lancée/.test(P));

sect('La recherche dit pourquoi une ligne répond');
t('le terme visible est surligné', /function surligner/.test(P) && /fmtMsg\(e, STATE\.q\)/.test(P));
t('⚠️ et le champ de la charge utile est NOMMÉ quand il ne se voit pas',
  /function indiceCharge/.test(P) && /indiceCharge\(e, STATE\.q\)/.test(P));
t('accents et casse ignorés', /sansAccents/.test(P));
t('le surlignage ne touche pas au balisage', /replace\(\/>\(\[\^<\]\+\)<\/g/.test(P));

sect('Le reste de la liste');
t('les compteurs du rail se chargent dès l’entrée', /chargerComptesRail/.test(P));
// ⚠️ La densité est AUTOMATIQUE : plus de bouton « compact/aéré » à régler
// ni de préférence à retenir. Elle se déduit de la place à l'écran et se
// recalcule au redimensionnement.
t('la densité s’adapte toute seule à l’écran',
  /function appliquerDensite/.test(P) && /innerHeight < 760 \|\| innerWidth < 900/.test(P)
  && /\.feed\.compact \.ev\{/.test(P));
t('⚠️ plus de bouton ni de préférence de densité à gérer',
  !/basculerDensite/.test(P) && !/origin_densite/.test(P) && !/id="densityBtn"/.test(P));
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

sect('Une offre ne porte plus aucun plafond TECHNIQUE');
// ⚠️ Personne n'achète « 120 dépôts par minute » ni « 512 Mo d'images ».
// Les faire vivre dans une offre revenait à vendre au client une panne
// qu'on lui inflige ensuite, un soir de rush, sans qu'il comprenne.
t('ni quota d’images ni débit dans le formulaire',
  !/id="ofQuota"/.test(P) && !/id="ofIngest"/.test(P));
t('et le serveur ne les lit plus non plus',
  !/screenQuota/.test(P) && !/maxIngest/.test(P));
t('⚠️ « illimité » SE COCHE, il ne se devine plus à un champ vide',
  /function champPlafond/.test(P) && /data-illimite="/.test(P));
t('la case éteint son champ plutôt que d’afficher un plafond qui ne s’applique pas',
  /champ\.disabled = c\.checked/.test(P) && /if \(c\.checked\) champ\.value = ''/.test(P));
t('⚠️ et un champ vide N’EST PAS « illimité » : on le refuse au lieu de livrer l’offre la plus large',
  /_vides/.test(P) && /donnez un nombre, ou cochez/.test(P));

sect('La durée de conservation se règle sur chaque environnement');
// ⚠️ Elle ne se posait qu'à la création de l'espace : un client qui la
// renégocie six semaines plus tard obligeait à passer par la console.
t('le champ est sur la fiche de l’environnement', /data-spfield="retention"/.test(P));
t('et l’enregistrement l’emporte', /retention: val\('retention'\)/.test(P));
t('⚠️ le plafond de l’offre est NOMMÉ quand il prend le dessus',
  /plafondConservation/.test(P) && /plafonne à ' \+ sp\.plafondConservation/.test(P));

sect('On arrive sur Origin Logs, pas chez un client');
// ⚠️ La marque affichait « Origin Roleplay » EN DUR, c'est-à-dire le nom
// d'un client, sur toutes les pages : la plateforme portait le nom de son
// premier client, et rien ne disait chez qui l'on venait d'entrer.
t('la marque est adressable', /id="brandMark"/.test(P) && /id="brandName"/.test(P) && /id="brandSub"/.test(P));
t('⚠️ plus aucun nom de client en dur dans la coquille',
  !/class="brand-name" id="brandName">Origin Roleplay/.test(P));
t('hors environnement, c’est Origin Logs', /dans \? esp\.nom : 'Origin Logs'/.test(P));
t('dedans, la page prend le nom du client, ses initiales et sa couleur',
  /initials\(\{ name: nom \}\) : 'OL'/.test(P) && /avatarStyle\(\{ name: nom \}\)/.test(P));
t('et l’onglet du navigateur le dit aussi', /document\.title = \(dans \? nom/.test(P));
t('⚠️ l’aperçu n’atterrit dans AUCUN environnement', /ME\.espace = null;/.test(P));
t('⚠️ tout se repeint SANS recharger — sinon l’aperçu, qui n’a pas de serveur, repartait dehors',
  /function poserEspaceDemo/.test(P) && /peindreIdentite\(\); buildNav\(\)/.test(P));
t('entrer et ressortir passent par un seul chemin',
  /function entrerEspace/.test(P) && /if \(D\.enter\) return entrerEspace/.test(P));

sect('Gérer les membres d’un environnement, sans y entrer');
// ⚠️ Il fallait ENTRER chez le client pour changer un grade : un
// aller-retour par geste, et une trace qui disait « fait depuis
// l'intérieur », comme si le client l'avait fait lui-même.
t('le bouton est sur la carte de l’environnement', /data-membres="\$\{sp\.id\}"/.test(P));
t('la liste montre qui, son grade et son mode de connexion',
  /data-mrole="/.test(P) && /Discord ' \+ esc\(m\.discordId\)/.test(P));
t('le grade est une liste des grades de CET environnement',
  /grades\.map\(r => `<option value="\$\{esc\(r\.key\)\}"/.test(P));
t('les quatre gestes sont là : grade, propriétaire, suspendre, retirer',
  /data-msave="/.test(P) && /data-mown="/.test(P) && /data-moff="/.test(P) && /data-mdel="/.test(P));
t('⚠️ les sièges de l’offre se disent AVANT d’ajouter, pas au moment du refus',
  /sieges/.test(P) && /Tous les sièges de l’offre sont pris/.test(P));
t('deux façons d’ajouter : créer, ou reprendre quelqu’un',
  /data-maddmode="neuf"/.test(P) && /data-maddmode="autre"/.test(P));
t('à la création : pseudo, Discord OU mot de passe, et un grade',
  /id="mPseudo"/.test(P) && /id="mDiscord"/.test(P) && /id="mPass"/.test(P) && /id="mGrade"/.test(P));
t('⚠️ reprendre un compte le DÉPLACE, et l’écran le dit avant le clic',
  /Reprendre un compte le <b>déplace<\/b>/.test(P));
t('la recherche filtre les candidats — six cents comptes ne se parcourent pas',
  /function remplirCandidats/.test(P) && /id="mCherche"/.test(P));

sect('Entrer chez un client, c’est y entrer en fondateur');
t('⚠️ l’étiquette ne ment plus, même en aperçu',
  /Fondateur \(équipe Origin Logs\)/.test(P));

sect('Équipe & rôles de la plateforme : un ONGLET, en deux parties');
// ⚠️ Même leçon que la liste des environnements : cet écran vivait dans
// une modale, on changeait un rôle, elle se refermait, et il fallait la
// rouvrir pour la personne suivante.
t('la vue existe', /id="viewStaff"/.test(P));
t('elle a son entrée dans le rail', /data-view="staff"/.test(P));
t('et son adresse', /'\/equipe-plateforme'/.test(P));
t('⚠️ le clic du rail la route vraiment', /dataset\.view === 'staff'\)\s*return goVue\('staff'\)/.test(P));
t('⚠️ DEUX parties, pas une page de dix-neuf cases à traverser pour trouver un nom',
  /data-staffpart="equipe"/.test(P) && /data-staffpart="perms"/.test(P)
  && /function partieEquipe/.test(P) && /function partiePermissions/.test(P));
t('l’équipe : changer un rôle, suspendre, virer',
  /data-prole="/.test(P) && /data-psuspend="/.test(P) && /data-pout="/.test(P));
t('⚠️ « virer » de l’équipe n’est pas supprimer le compte, et le dialogue le dit',
  /Son compte et son environnement restent/.test(P));
t('le journal personnel de chacun est à un clic', /data-pjournal="/.test(P) && /function journalMembre/.test(P));
t('⚠️ et il se filtre sur l’IDENTIFIANT, pas sur le pseudo — deux espaces ont chacun leur « Nyx »',
  /journal\?limit=200&membre=/.test(P));
t('les permissions : toutes les cases, par groupe', /data-pperm="/.test(P) && /roles\.groupes\.map/.test(P));
t('créer et supprimer un rôle', /id="pnrGo"/.test(P) && /data-prdel="/.test(P) && /data-prsave="/.test(P));
t('⚠️ la Direction reste inerte : décocher la gouvernance fermerait la porte à tout le monde',
  /r\.key === 'direction' \|\| !roles\.peutComposer/.test(P));
t('⚠️ on n’accorde que des droits qu’on détient soi-même',
  /!roles\.mesDroits\.includes\(x\.id\) \? 'disabled'/.test(P));
t('un rôle naît SANS aucun droit', /perms: \[\] \}\)/.test(P) && /naît <b>sans aucun droit<\/b>/.test(P));
t('⚠️ UNE SEULE implémentation : le raccourci du rail ouvre l’onglet, il ne rouvre pas une modale',
  /function ouvrirEquipePlateforme\(\) \{ goVue\('staff'\); \}/.test(P));

sect('La page de connexion : mot de passe ET Discord');
// ⚠️ Le bouton Discord EXISTE avant l'OAuth — mais grisé et inerte,
// pas une fausse promesse : cliquer avant que la liaison soit branchée
// mènerait à une erreur. Il s'allume tout seul une fois les secrets posés.
t('l’écran de connexion existe', /id="gate"/.test(P) && /id="gateForm"/.test(P));
t('champ pseudo et champ mot de passe', /id="gatePseudo"/.test(P) && /id="gatePass"/.test(P));
t('un bouton Discord, avec un libellé qu’on peut changer',
  /id="gateDiscord"/.test(P) && /class="d-txt"/.test(P));
t('⚠️ sans OAuth, le bouton reste MONTRÉ mais grisé et non cliquable',
  /dc\.classList\.add\('soon'\)/.test(P) && /dc\.removeAttribute\('href'\)/.test(P)
  && /aria-disabled/.test(P));
t('et il porte « bientôt »', /class="d-soon">bientôt/.test(P));
t('avec OAuth, il redevient un vrai lien vers /api/auth/discord',
  /dc\.setAttribute\('href', '\/api\/auth\/discord'\)/.test(P));
t('⚠️ un bouton « soon » grisé a son propre style, pas celui du bouton actif',
  /\.btn\.discord\.soon\{/.test(P) && /cursor:not-allowed/.test(P));
t('⚠️ la démonstration MONTRE la page de connexion au lieu de la sauter',
  /return showGate\(\);/.test(P) && /await showGate\(\); }\s*\n\s*else \{ MODE = 'api'/.test(P));
t('en démo, on entre avec demo / demo', /=== 'demo'\s*\n?\s*&& \$\('#gatePass'\)\.value === 'demo'/.test(P)
  || /value === 'demo'/.test(P));
t('et un mauvais couple montre l’écran d’erreur, pas le panneau',
  /Démonstration : entrez demo \/ demo/.test(P));

sect('Le profil joueur agit en jeu');
// ⚠️ Huit gestes demandés sur la fiche d'un joueur. Chacun a son bouton,
// gardé par sa permission, et le dialogue traite le motif selon le geste.
t('les boutons existent et portent chacun leur droit',
  /can\('actions\.heal'\)[\s\S]{0,80}data-act="heal"/.test(P)
  && /can\('actions\.revive'\)[\s\S]{0,80}data-act="revive"/.test(P)
  && /can\('actions\.freeze'\)[\s\S]{0,80}data-act="freeze"/.test(P)
  && /data-act="unfreeze"/.test(P)
  && /can\('actions\.message'\)[\s\S]{0,80}data-act="message"/.test(P)
  && /can\('players\.inventory'\)[\s\S]{0,90}data-act="inventory"/.test(P));
t('⚠️ le miroir de ACTION_SANS_MOTIF vit côté panneau aussi, aligné sur le serveur',
  /const SANS_MOTIF = new Set\(\['unban','heal','revive','freeze','unfreeze','inventory'\]\)/.test(P));
t('un message est obligatoire, un motif de geste ne l’est pas',
  /type === 'message' && reason\.length < 1/.test(P)
  && /type !== 'message' && !SANS_MOTIF\.has\(type\) && reason\.length < 3/.test(P));
t('l’inventaire ne passe pas par le dialogue de confirmation',
  /if \(type === 'inventory'\) return demanderInventaire/.test(P));
t('⚠️ l’inventaire est LU en deux temps, par relances, sans figer l’écran',
  /function demanderInventaire/.test(P) && /DS\.actionResult\(id\)/.test(P)
  && /if \(\$\('#sheet'\)\.hidden\) return;/.test(P));
t('un échec d’inventaire montre le message clair du serveur',
  /r\.result \|\| 'Action en échec\.'/.test(P));
t('la vue d’intégration dit quelle ressource assure chaque geste',
  /Gestes sur les joueurs/.test(P) && /d\.capacites\.map/.test(P)
  && /d\.gestesUniversels\.map/.test(P));

sect('« Analyse » : UNE rubrique, quatre sous-onglets');
// ⚠️ Statistiques, Économie, Temps de jeu et Équipe répondaient chacun à une
// facette de « que disent les chiffres ? ». Quatre rubriques à moitié vides
// valaient moins qu'un seul écran assumant ses onglets. La barre de
// sous-onglets est partagée ; chaque vue et chaque fonction de rendu restent.
t('une SEULE rubrique « Analyse » dans le rail', /data-view="analyse"/.test(P)
  && !/data-view="economy" style/.test(P));
t('elle ouvre le dernier sous-onglet consulté',
  /dataset\.view === 'analyse'\) return goVue\(STATE\.analyseTab \|\| 'stats'\)/.test(P)
  && /if \(ANALYSE_TABS\.includes\(v\)\) STATE\.analyseTab = v/.test(P));
t('et reste active pour tous ses sous-onglets',
  /b\.dataset\.view === 'analyse' && ANALYSE_TABS\.includes\(STATE\.view\)/.test(P));
t('la barre de sous-onglets est partagée', /function analyseTabs\(/.test(P)
  && /const ANALYSE_TABS = \['stats', 'economy', 'playtime', 'team'\]/.test(P));
t('⚠️ « Équipe » n’est un sous-onglet que si on peut la voir',
  /if \(can\('team\.stats'\)\) tabs\.push\(\{ v:'team'/.test(P));
for (const [v, path, fn] of [
  ['economy',  '/economie',     'renderEconomy'],
  ['playtime', '/temps-de-jeu', 'renderPlaytime'],
  ['stats',    '/statistiques', 'renderStats'],
]) {
  t(`${v} : la vue existe`, new RegExp(`id="view${v[0].toUpperCase()+v.slice(1)}"`).test(P));
  t(`${v} : son adresse`, P.includes(`'${path}'`));
  t(`${v} : le sous-onglet la route`, new RegExp(`dataset\\.view === '${v}'\\)\\s*return goVue\\('${v}'\\)`).test(P));
  t(`${v} : sa fonction de rendu est branchée`, new RegExp(`STATE\\.view === '${v}'\\) ${fn}\\(\\)`).test(P)
    && new RegExp(`function ${fn}\\(`).test(P));
}
t('⚠️ les écrans d’argent ne fabriquent pas de montant : le flux additionne les mouvements CHARGÉS',
  /sur \$\{charges\.length\} mouvement\(s\) chargé\(s\)/.test(P));
t('⚠️ le temps de jeu dit que l’activité est un PROXY tant que la durée réelle manque',
  /proxy en attendant la durée réelle/.test(P));
t('⚠️ « Vue d’équipe » n’est plus une rubrique séparée du rail',
  !/data-view="team" style/.test(P));
t('« Tableau de bord » a remplacé « Vue d’ensemble » dans le rail',
  /nav-label">Tableau de bord</.test(P));

sect('L’administration est en PAGES, plus en fenêtres');
// ⚠️ Rôles, Réglages, Comptes et Journal étaient des modales. Un back-office
// se parcourt : on y revient, on y règle plusieurs choses de suite. Chacun
// est une vue pleine (data-view), avec son adresse et son garde
// anti-reconstruction, et n'ouvre plus openSheet.
for (const [k, path, fn, marker] of [
  ['roles',    '/roles',           'renderRolesPage',    '#roleList'],
  ['settings', '/reglages',        'renderSettingsPage', '#dcClient'],
  ['comptes',  '/comptes',         'renderComptesPage',  '#comptesList'],
  ['audit',    '/journal-panneau', 'renderAuditPage',    '#auditTrail'],
]) {
  t(`${k} : la vue existe`, new RegExp(`id="view${k[0].toUpperCase()+k.slice(1)}"`).test(P));
  t(`${k} : son adresse`, P.includes(`'${path}'`));
  t(`${k} : le clic du rail la route`, new RegExp(`dataset\\.view === '${k}'\\)\\s*return goVue\\('${k}'\\)`).test(P));
  t(`${k} : sa fonction de rendu est branchée dans render()`,
    new RegExp(`STATE\\.view === '${k}'\\) ${fn}\\(\\)`).test(P) && new RegExp(`function ${fn}\\(`).test(P));
  t(`${k} : garde anti-reconstruction`,
    new RegExp(`if \\(!force && host\\.querySelector\\('${marker}'\\)\\) return;`).test(P));
}
t('⚠️ l’admin passe par data-view, plus par data-admin (routage)',
  !/dataset\.admin/.test(P) && !/data-admin="/.test(P));
t('⚠️ « Comptes » est distinct du sous-onglet Analyse « Équipe »',
  /k:'comptes',\s*label:'Comptes'/.test(P) && !/label:'Équipe'.*accès/.test(P));

const n=T.filter(([o])=>o).length;
console.log(`\n  ${n}/${T.length} contrôles passés`);
process.exit(n===T.length?0:1);
