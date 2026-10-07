# BD Report — publicité 30 s : voix off

La vidéo `video/out/bd-report-pub-30s.mp4` est livrée **avec musique et sous-titres
incrustés, sans voix**. Elle tient seule : la majorité des vidéos sur LinkedIn et
Instagram se regardent son coupé, et les sous-titres disent tout.

Ce document sert à ajouter la voix. Les timecodes sont ceux de l'image, à 50 ms près —
le fichier `bd-report-pub-30s.srt` les donne au format standard.

## Le texte, réplique par réplique

| Début | Fin | Réplique | Jeu |
|---|---|---|---|
| 0,55 | 2,75 | Une formule modifiée en cours d'année… | Posé, presque las. On constate, on ne se plaint pas. |
| 2,85 | 4,75 | quatre outils, quatre chiffres différents… | Même ton, un cran plus rapide — l'énumération accélère. |
| 4,85 | 6,55 | le retard, découvert le 28. | Ralentir sur « le 28 ». Laisser tomber la phrase. |
| — | — | *(silence — l'impact à 7,45 s)* | **Ne rien dire.** Le choc est sonore. |
| 7,60 | 10,05 | La fin de mois ? … Elle se constate. | LA réplique. Vraie pause après la question (≈ 0,5 s). Sourire dans la voix sur « constate ». |
| 10,35 | 12,30 | BD Report. | Net, sans emphase. Le logo fait le travail. |
| 12,60 | 16,85 | Rendez-vous, pipeline, primes, pilotage : un seul espace. | Énergie qui monte. Liste rythmée, poser « un seul espace ». |
| 17,15 | 21,45 | Chaque passage en SQL déclenche la prime, au barème du jour. Figée. | « Figée » tombe **sur le déclic du cadenas** (19,5 s) ou juste après. |
| 21,80 | 25,60 | Et une raison d'appeler, trouvée pour vous. | Complice, plus bas. Un secret entre commerciaux. |
| 26,00 | 29,70 | Toute la prospection, et la rémunération qui va avec. Essayez la démo. | Le slogan, en entier, sans se presser. « Essayez la démo » : une invitation, pas une injonction. |

**63 mots pour 30 secondes**, débit moyen 2,4 mots/s, aucune réplique au-delà de
3,2 mots/s : le confort d'une voix publicitaire française, avec de l'air pour les
silences. `render.mjs` refuse toute réplique au-delà de 3,6 mots/s — la première
version du pivot en demandait 5,3, et aucun comédien ne l'aurait tenue.

**Voix conseillée** : plutôt grave et chaleureuse, 30–45 ans, ton « collègue qui sait »
plutôt que « speaker radio ». La cible est un BDR ou un manager commercial : on lui parle
de son quotidien, pas d'une promesse.

## L'enregistrer

Trois possibilités, de la plus rapide à la plus soignée :

1. **Vous-même**, au téléphone, dans une pièce calme (un placard plein de vêtements fait
   une cabine étonnamment bonne). Lisez sur la vidéo en lecture pour caler le rythme.
2. **Une voix de synthèse** (ElevenLabs, Azure, Google) : collez le texte réplique par
   réplique. Exportez chaque réplique séparément — c'est le calage qui fait la qualité,
   pas la voix.
3. **Un comédien** (Voice123, Fiverr, Malt) : envoyez ce document et la vidéo. Un 30 s
   coûte généralement entre 80 et 300 € selon les droits de diffusion — précisez « web
   et réseaux sociaux, durée illimitée ».

## La mixer par-dessus la musique

Avec un fichier `voix.wav` calé sur la vidéo (début à 0,0 s) :

```bash
ffmpeg -i video/out/bd-report-pub-30s.mp4 -i voix.wav -filter_complex \
  "[1:a]volume=1.0[v];[0:a][v]sidechaincompress=threshold=0.05:ratio=6:attack=20:release=300[m];[m][v]amix=inputs=2:normalize=0[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k video/out/bd-report-pub-30s-voix.mp4
```

Le `sidechaincompress` baisse la musique **pendant que la voix parle** et la remonte dans
les silences — c'est ce qui rend un mixage publicitaire intelligible. La musique a déjà
été écrite pour ça (médiums dégagés, niveau moyen bas).

## Refaire la vidéo

```bash
npm run video          # musique + rendu image par image → video/out/
```

Il faut un `ffmpeg` : celui du système, ou `npm i --no-save ffmpeg-static`, ou la
variable `FFMPEG=/chemin/vers/ffmpeg`. Le texte des sous-titres vit dans `video/ad.html`
(`window.VO`) — **modifier le texte là, et nulle part ailleurs** : le `.srt` en est
généré, si bien que l'écran et la voix ne peuvent pas diverger.
