// ---------------------------------------------------------------------------
//  Les trois modèles téléchargeables (aimants à contacts)
//
//  Rendus en PDF au moment du build plutôt que déposés en binaire dans le dépôt :
//  dans six mois, une coquille se corrige en éditant du texte, pas en refaisant un
//  fichier que plus personne ne sait produire. Le CSV du barème est écrit tel quel,
//  puisqu'il a vocation à être OUVERT dans un tableur, pas lu.
//
//  Usage : node scripts/modeles.mjs [dossier de sortie]
// ---------------------------------------------------------------------------
import { chromium } from 'playwright-core'
import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const OUT = process.argv[2] || 'site/assets/modeles'
mkdirSync(OUT, { recursive: true })

const findChromium = () => {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'
  if (!existsSync(root)) return undefined
  const dir = readdirSync(root).find(d => d.startsWith('chromium-'))
  return dir ? path.join(root, dir, 'chrome-linux', 'chrome') : undefined
}

const shell = (title, body) => `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 18mm 16mm 16mm }
  * { box-sizing: border-box }
  body { font-family: Inter, system-ui, sans-serif; color: #16141C; font-size: 10.5pt; line-height: 1.55; margin: 0 }
  header { display: flex; align-items: center; gap: 10px; border-bottom: 2px solid #16141C; padding-bottom: 10px; margin-bottom: 22px }
  .mark { width: 26px; height: 26px; border-radius: 7px; background: linear-gradient(135deg, #7C5CFF, #22D3A6) }
  header b { font-size: 13pt; letter-spacing: -.02em }
  header span { margin-left: auto; font-size: 8.5pt; color: #6B6779; text-transform: uppercase; letter-spacing: .12em }
  h1 { font-size: 22pt; line-height: 1.12; letter-spacing: -.02em; margin: 0 0 6px }
  .lede { color: #4A4657; font-size: 11pt; margin: 0 0 20px }
  h2 { font-size: 12.5pt; margin: 20px 0 7px; letter-spacing: -.01em }
  h3 { font-size: 10.5pt; margin: 14px 0 4px; color: #3A3648 }
  p, li { margin: 0 0 7px }
  ul, ol { margin: 0 0 10px; padding-left: 18px }
  table { width: 100%; border-collapse: collapse; margin: 10px 0 14px; font-size: 9.5pt }
  th, td { border: 1px solid #DCD8E6; padding: 6px 8px; text-align: left; vertical-align: top }
  th { background: #F3F1F7; font-weight: 700; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .06em }
  .box { border: 1px solid #DCD8E6; border-left: 3px solid #7C5CFF; border-radius: 6px; padding: 10px 13px; margin: 12px 0; background: #FAF9FC }
  .box b { color: #5B3FE0 }
  .say { border-left: 3px solid #22A98A; background: #F2FAF8; padding: 9px 13px; margin: 8px 0; border-radius: 0 6px 6px 0 }
  .avoid { border-left: 3px solid #C2334D; background: #FDF4F6; padding: 9px 13px; margin: 8px 0; border-radius: 0 6px 6px 0 }
  .muted { color: #6B6779 }
  footer { margin-top: 26px; padding-top: 10px; border-top: 1px solid #DCD8E6; font-size: 8.5pt; color: #6B6779;
           display: flex; justify-content: space-between; gap: 12px }
  .fill { display: inline-block; min-width: 90px; border-bottom: 1px solid #B9B3C6 }
</style></head><body>
<header><span class="mark"></span><b>BD Report</b><span>${title}</span></header>
${body}
<footer><span>Modèle BD Report — réutilisable librement au sein de votre entreprise.</span><span>bdreport — l'espace sales des BDR et SDR</span></footer>
</body></html>`

const DOCS = [
  {
    file: 'bd-report-bareme-commissions.pdf',
    title: 'Barème de commissions',
    body: `
<h1>Construire un barème de commissions BDR</h1>
<p class="lede">Un modèle à remplir, et les quatre décisions à prendre avant de le remplir. Comptez une heure avec votre direction commerciale.</p>

<h2>1. Les quatre décisions, dans l'ordre</h2>
<table>
  <tr><th style="width:26%">Décision</th><th>Ce qui se joue</th><th style="width:22%">Votre choix</th></tr>
  <tr><td><b>Le déclencheur</b></td><td>À quelle étape la prime est acquise. Le rendez-vous tenu récompense l'activité ; l'opportunité qualifiée récompense la qualité. Le second est presque toujours le bon choix — il aligne le BDR sur l'AE.</td><td><span class="fill">&nbsp;</span></td></tr>
  <tr><td><b>La part variable</b></td><td>Rapport fixe / variable. 70/30 est la norme du marché en Europe pour un BDR. En dessous de 20 % de variable, le levier ne motive plus ; au-dessus de 40 %, il crée du stress et de la sélection adverse.</td><td><span class="fill">&nbsp;</span></td></tr>
  <tr><td><b>La modulation</b></td><td>Le montant varie-t-il selon la taille du compte, la provenance du lead, ou les deux ? Moduler récompense l'effort réel — un compte de 500 personnes ne se travaille pas comme un compte de 10.</td><td><span class="fill">&nbsp;</span></td></tr>
  <tr><td><b>Le rattachement</b></td><td>Une prime déclenchée le 28 est-elle payée ce mois-ci ou le suivant ? Fixez un jour de bascule et écrivez-le. C'est la première source de litige en fin de mois.</td><td><span class="fill">&nbsp;</span></td></tr>
</table>

<h2>2. Le barème à remplir</h2>
<p>Une ligne par croisement taille de compte × provenance. Commencez simple : deux tailles et deux provenances suffisent pour la première année.</p>
<table>
  <tr><th>Effectif du compte</th><th>Provenance du lead</th><th>Montant par opportunité qualifiée</th><th>Commentaire</th></tr>
  <tr><td>1 à 49</td><td>Sortant (cold call, e-mail)</td><td><span class="fill">&nbsp;</span> €</td><td></td></tr>
  <tr><td>1 à 49</td><td>Entrant (formulaire, contenu)</td><td><span class="fill">&nbsp;</span> €</td><td>Souvent 30 à 50 % du sortant : l'effort n'est pas le même.</td></tr>
  <tr><td>50 à 249</td><td>Sortant</td><td><span class="fill">&nbsp;</span> €</td><td></td></tr>
  <tr><td>50 à 249</td><td>Entrant</td><td><span class="fill">&nbsp;</span> €</td><td></td></tr>
  <tr><td>250 et plus</td><td>Sortant</td><td><span class="fill">&nbsp;</span> €</td><td>Grand compte : cycle plus long, prime plus élevée.</td></tr>
  <tr><td>250 et plus</td><td>Entrant</td><td><span class="fill">&nbsp;</span> €</td><td></td></tr>
</table>

<h2>3. L'accélérateur</h2>
<p>Au-delà de l'objectif, le montant par opportunité augmente. C'est le levier le plus efficace du plan, et le plus souvent oublié.</p>
<table>
  <tr><th>Atteinte de l'objectif</th><th>Multiplicateur</th><th>Effet</th></tr>
  <tr><td>Jusqu'à 100 %</td><td>× 1,0</td><td>Barème normal.</td></tr>
  <tr><td>De 100 % à 130 %</td><td>× <span class="fill">&nbsp;</span></td><td>1,3 est un point de départ courant.</td></tr>
  <tr><td>Au-delà de 130 %</td><td>× <span class="fill">&nbsp;</span></td><td>Plafonner ou non : décision de direction.</td></tr>
</table>

<h2>4. Les trois règles à écrire noir sur blanc</h2>
<ol>
  <li><b>Le barème en vigueur au moment du déclenchement s'applique.</b> Changer la grille ne réécrit jamais le passé. Sans cette phrase, chaque révision rouvre les mois clos.</li>
  <li><b>Une opportunité annulée après coup annule la prime</b>, sauf si elle a déjà été payée. Précisez le délai de rétractation — trente jours est usuel.</li>
  <li><b>Le plan est communiqué avant la période qu'il couvre</b>, jamais pendant. Une règle annoncée en cours de mois est vécue comme un déplacement du but.</li>
</ol>

<div class="box">
  <b>Test de solidité.</b> Faites calculer par trois personnes différentes la prime d'un même mois fictif, séparément. Si les trois résultats diffèrent, le plan est trop complexe — quel que soit l'outil qui le calcule.
</div>

<h2>5. Erreurs les plus fréquentes</h2>
<ul>
  <li><b>Trop de critères.</b> Au-delà de trois variables, le BDR ne sait plus quoi optimiser, et le plan cesse de piloter quoi que ce soit.</li>
  <li><b>Récompenser le rendez-vous pris plutôt que tenu.</b> Vous obtiendrez des rendez-vous pris.</li>
  <li><b>Aucun plancher de qualité.</b> Ajoutez une condition simple : un compte hors cible ne déclenche rien.</li>
  <li><b>Un plan qui change tous les trimestres.</b> La stabilité vaut plus que l'optimisation fine.</li>
</ul>`,
  },
  {
    file: 'bd-report-script-cold-call.pdf',
    title: 'Script de cold call',
    body: `
<h1>Script de cold call — la trame des trente premières secondes</h1>
<p class="lede">Un script n'est pas un texte à réciter : c'est une carte des bifurcations. Celui-ci en couvre cinq. Adaptez le vocabulaire, gardez la structure.</p>

<h2>1. L'ouverture (10 secondes)</h2>
<p>Deux familles fonctionnent mieux que les autres. Choisissez-en une et tenez-vous-y un mois avant de juger.</p>

<h3>La permission</h3>
<div class="say">« Bonjour <span class="fill">&nbsp;</span>, c'est <span class="fill">&nbsp;</span> de <span class="fill">&nbsp;</span>. Je vous appelle à froid — vous me donnez trente secondes pour vous dire pourquoi, et vous me dites si ça vaut la peine de continuer ? »</div>
<p class="muted">Pourquoi ça marche : reconnaître l'appel à froid désamorce la méfiance, et demander trente secondes rend le refus facile — donc l'accord sincère.</p>

<h3>L'observation</h3>
<div class="say">« Bonjour <span class="fill">&nbsp;</span>. J'ai vu que vous recrutiez <span class="fill">&nbsp;</span> commerciaux ce trimestre. En général, quand une équipe grandit à ce rythme, <span class="fill">&nbsp;</span> devient un sujet. C'est votre cas ? »</div>
<p class="muted">Pourquoi ça marche : l'observation prouve en une phrase que l'appel n'est pas envoyé en masse. Elle doit être vraie et vérifiable, sinon elle se retourne.</p>

<div class="avoid"><b>À bannir :</b> « Comment allez-vous ? » · « Est-ce que je vous dérange ? » · « Je me permets de vous appeler car… » · toute phrase de plus de deux lignes · le nom de votre produit avant la vingtième seconde.</div>

<h2>2. Le problème (20 secondes)</h2>
<p>Ne décrivez pas votre solution. Décrivez la situation de votre interlocuteur, et laissez-le confirmer ou corriger.</p>
<div class="say">« Ce qu'on nous décrit souvent, c'est <span class="fill">&nbsp;</span>. Résultat, <span class="fill">&nbsp;</span>. Ça vous parle, ou c'est déjà réglé chez vous ? »</div>
<p>La question fermée finale est essentielle : elle transforme un monologue en conversation et vous donne l'information dont vous avez besoin pour la suite.</p>

<h2>3. Les cinq bifurcations</h2>
<table>
  <tr><th style="width:30%">Ce qu'il dit</th><th>Ce que vous répondez</th></tr>
  <tr><td>« Envoyez-moi un e-mail. »</td><td>« Je le fais tout de suite. Pour ne pas vous envoyer un message générique : c'est plutôt <span class="fill">&nbsp;</span> ou <span class="fill">&nbsp;</span> qui vous concerne ? » — puis envoyez vraiment, dans l'heure.</td></tr>
  <tr><td>« On a déjà un outil. »</td><td>« Logique, tout le monde en a un. Ce qu'on nous appelle pour régler, c'est plutôt <span class="fill">&nbsp;</span> — c'est couvert chez vous ? »</td></tr>
  <tr><td>« Pas le temps. »</td><td>« Bien sûr. Je vous rappelle <span class="fill">&nbsp;</span> à <span class="fill">&nbsp;</span>, ou c'est un non définitif ? » — la seconde branche vous fait gagner autant de temps que la première.</td></tr>
  <tr><td>« Ce n'est pas moi qui décide. »</td><td>« Compris. Qui regarde ce sujet chez vous, et est-ce que je peux me recommander de vous ? »</td></tr>
  <tr><td>« Ça coûte combien ? »</td><td>« Ça dépend de <span class="fill">&nbsp;</span>. Pour vous donner un chiffre qui veut dire quelque chose, deux questions rapides ? » — une objection prix précoce est un signal d'intérêt, pas un rejet.</td></tr>
</table>

<h2>4. La clôture</h2>
<p>Ne demandez jamais « est-ce que ça vous intéresse ». Proposez une prochaine étape précise, datée, courte.</p>
<div class="say">« Je vous propose vingt minutes <span class="fill">&nbsp;</span> ou <span class="fill">&nbsp;</span>. On regarde <span class="fill">&nbsp;</span>, et si ce n'est pas pour vous, on s'arrête là. Lequel vous arrange ? »</div>

<div class="box">
  <b>Après l'appel, trois lignes, tout de suite.</b> Ce qui a été dit, la prochaine action, la date. Un compte rendu écrit dans la minute vaut mieux qu'un compte rendu parfait écrit le lendemain — et la moitié des relances perdues le sont ici.
</div>

<h2>5. Mesurer, pas ressentir</h2>
<ul>
  <li><b>Taux de décroché</b> — dépend de l'heure et du fichier, pas du script.</li>
  <li><b>Taux de passage des trente secondes</b> — c'est votre ouverture qui est jugée.</li>
  <li><b>Taux de rendez-vous obtenus / conversations</b> — c'est votre problème et votre clôture.</li>
  <li><b>Taux de rendez-vous tenus</b> — un écart important signale des rendez-vous arrachés plutôt qu'acceptés.</li>
</ul>
<p>Changez une seule variable à la fois, sur au moins cinquante appels. En dessous, vous mesurez du bruit.</p>`,
  },
  {
    file: 'bd-report-trame-daily.pdf',
    title: 'Trame de daily',
    body: `
<h1>La trame d'un daily commercial de neuf minutes</h1>
<p class="lede">Un rituel court tient dans la durée ; un rituel long est annulé au bout de trois semaines. Voici le format, minute par minute, et ce qu'il faut en sortir.</p>

<h2>Le format</h2>
<table>
  <tr><th style="width:16%">Durée</th><th style="width:26%">Séquence</th><th>Contenu</th></tr>
  <tr><td>1 min</td><td>Le chiffre du jour</td><td>Un seul indicateur, lu à voix haute : où en est l'équipe par rapport au mois. Pas de commentaire, pas de justification.</td></tr>
  <tr><td>5 min</td><td>Tour de table</td><td>Trente à quarante secondes par personne. Trois questions, dans cet ordre, sans dévier.</td></tr>
  <tr><td>2 min</td><td>Le point bloquant</td><td>Un seul sujet, choisi par le manager parmi ceux remontés. Les autres partent en aparté.</td></tr>
  <tr><td>1 min</td><td>L'engagement</td><td>Chacun annonce son objectif de la journée en une phrase. C'est ce qui rend le daily suivant utile.</td></tr>
</table>

<h2>Les trois questions du tour de table</h2>
<ol>
  <li><b>Qu'est-ce qui a avancé depuis hier ?</b> Des faits, pas des intentions. « J'ai eu le DRH de Lamarche » plutôt que « j'ai travaillé sur Lamarche ».</li>
  <li><b>Qu'est-ce que je fais aujourd'hui ?</b> Deux ou trois actions nommées, pas une liste.</li>
  <li><b>Qu'est-ce qui me bloque ?</b> Si rien ne bloque, on passe. Cette question n'existe que pour faire remonter, pas pour meubler.</li>
</ol>

<div class="box">
  <b>La règle qui fait tenir le format.</b> Dès qu'un sujet dépasse une minute, le manager dit « on prend ça après » et passe. Sans cette règle, le daily dérive vers vingt minutes et l'équipe cesse d'y venir. Elle doit être annoncée le premier jour et appliquée dès le premier écart.
</div>

<h2>Ce qui tue un daily</h2>
<ul>
  <li><b>Le transformer en revue de pipeline.</b> Ce sont deux rituels différents : le daily dure neuf minutes, la revue de pipeline dure une heure et se tient une fois par semaine.</li>
  <li><b>Le manager qui parle plus que l'équipe.</b> Si vous dépassez deux minutes cumulées, ce n'est plus un daily, c'est une réunion d'information.</li>
  <li><b>Un horaire flottant.</b> Même heure tous les jours, ou il disparaît en un mois.</li>
  <li><b>Les félicitations et les recadrages.</b> Ils se font en tête-à-tête. En public, l'un gêne et l'autre humilie.</li>
  <li><b>Attendre les retardataires.</b> On commence à l'heure, même à trois.</li>
</ul>

<h2>La feuille du manager</h2>
<p>À remplir pendant le tour de table — trois colonnes suffisent, et elles alimentent directement les entretiens individuels de fin de semaine.</p>
<table>
  <tr><th style="width:22%">Personne</th><th style="width:39%">Engagement du jour</th><th>Blocage remonté</th></tr>
  <tr><td style="height:26px"></td><td></td><td></td></tr>
  <tr><td style="height:26px"></td><td></td><td></td></tr>
  <tr><td style="height:26px"></td><td></td><td></td></tr>
  <tr><td style="height:26px"></td><td></td><td></td></tr>
  <tr><td style="height:26px"></td><td></td><td></td></tr>
  <tr><td style="height:26px"></td><td></td><td></td></tr>
</table>

<h2>Le signe que ça fonctionne</h2>
<p>Au bout de trois semaines, les engagements de la veille sont tenus sans que vous ayez à les rappeler, et les blocages remontent avant d'avoir coûté une semaine. Si ce n'est pas le cas, le problème n'est pas le format du daily : c'est que les engagements n'y sont jamais relus.</p>`,
  },
]

const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] })
const page = await browser.newPage()
for (const doc of DOCS) {
  await page.setContent(shell(doc.title, doc.body), { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(700) // laisse la police se charger
  await page.pdf({ path: path.join(OUT, doc.file), format: 'A4', printBackground: true })
  console.log('✓', doc.file)
}
await browser.close()

// Le barème s'utilise dans un tableur : un PDF ne se remplit pas, un CSV oui.
writeFileSync(path.join(OUT, 'bd-report-bareme-commissions.csv'),
  '﻿' + [
    'Effectif min;Effectif max;Provenance du lead;Montant par opportunité qualifiée (€);Commentaire',
    '1;49;Sortant;;',
    '1;49;Entrant;;Souvent 30 à 50 % du sortant',
    '50;249;Sortant;;',
    '50;249;Entrant;;',
    '250;99999;Sortant;;Grand compte : cycle plus long',
    '250;99999;Entrant;;',
    ';;;;',
    'Palier objectif;Multiplicateur;;;',
    'Jusqu\'à 100 %;1;;;',
    'De 100 % à 130 %;;;;1,3 est un point de départ courant',
    'Au-delà de 130 %;;;;Plafonner ou non : décision de direction',
  ].join('\n') + '\n')
console.log('✓ bd-report-bareme-commissions.csv')
