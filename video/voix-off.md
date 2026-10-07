# BD Report — publicité 30 s : voix off

Deux fichiers sortent de `video/out/` :

| Fichier | Contenu |
|---|---|
| `bd-report-pub-30s-voix.mp4` | **La version à publier** : voix off de synthèse, musique atténuée sous la voix, sous-titres incrustés. |
| `bd-report-pub-30s.mp4` | Musique et sous-titres, sans voix — pour une boucle muette ou une voix enregistrée plus tard. |

## ⚖️ Crédit obligatoire

La voix est synthétisée par **Piper** avec le modèle **fr_FR-siwis-medium**, entraîné
sur le corpus **SIWIS** (CC BY 4.0). L'usage commercial est permis **à condition de
créditer la source**. À placer dans la description de la publication, ou sur une page
de mentions du site :

> Voix de synthèse : Piper (fr_FR-siwis-medium), entraînée sur le corpus SIWIS French
> Speech Synthesis Database — P.-E. Honnet, A. Lazaridis, P. N. Garner, J. Yamagishi,
> CC BY 4.0 (https://datashare.is.ed.ac.uk/handle/10283/2353).

**Pourquoi cette voix et pas une autre.** C'est la seule voix française de qualité
correcte dont la licence est sans ambiguïté pour une publicité :

| Voix | Licence | Verdict |
|---|---|---|
| **siwis** (féminine) | CC BY 4.0 | ✅ retenue — crédit obligatoire |
| tom (masculine) | AGPLv3 | ❌ copyleft fort, statut flou pour un son généré |
| upmc (masculine) | CC BY-SA 4.0 | ❌ clause « partage à l'identique » qui pourrait s'étendre à la pub |
| gilles, mls (masculines) | CC0 / CC BY | ❌ qualité « low », 16 kHz : un son étouffé |
| edge-tts, voix Google… | — | ❌ voix excellentes, mais leur usage par ces outils contourne l'API officielle : aucun droit de diffusion publicitaire |

Une **voix masculine grave** (celle que ce script recommandait d'abord) n'existe donc
pas proprement en local. Pour l'avoir : un comédien, ou un service payant qui accorde
explicitement les droits commerciaux (ElevenLabs en offre payante, par exemple).

## Ce que la machine a vérifié — et ce qu'elle n'a pas pu

**Personne n'a écouté cette voix avant livraison** : l'environnement de fabrication n'a
pas de sortie son, et les modèles de reconnaissance vocale y sont inaccessibles. Ce qui
a été contrôlé, objectivement :

- **La prononciation, phonème par phonème.** C'est ce que le modèle reçoit en entrée.
  Ce contrôle a trouvé trois pièges, tous corrigés et désormais REFUSÉS par `voice.py`
  s'ils reviennent :
  - « BD » lu comme l'abréviation de **boulevard** → la pub disait « Boulevard Report » ;
  - « pipeline » lu à la française (« pip-line ») → réécrit pour donner *païp-laïn* ;
  - **les voyelles nasales perdues** avec l'ancienne version du modèle (« constate »
    devenait « costate ») → remplacé par la version actuelle.
- **Chaque réplique tient dans son créneau**, à débit naturel ou presque (accélération
  maximale ×1,12 sur « Elle se constate »). `voice.py` refuse une réplique qui ne tient
  pas même en accélérant de 19 %.
- **Le rythme est déterministe** : la même commande donne les mêmes durées, donc le
  même calage.

**À écouter vous-même avant publication**, en particulier : « Bi Di Riporte » (la marque),
« SQL » (dit *èss-ku-èl*, à la française), et le naturel général — une voix de synthèse
locale reste en dessous d'un comédien.

## Le texte, calé sur l'image

Le texte vit dans `video/ad.html` (`window.VO`) et **nulle part ailleurs** : le `.srt`
en est généré, puis lu par `voice.py`. Écran, sous-titres et voix ne peuvent diverger.

| Début | Réplique | Calage |
|---|---|---|
| 0,55 | Une formule modifiée en cours d'année… | le barème change sous les yeux |
| 2,85 | quatre outils, quatre chiffres… | les quatre cartes, quatre chiffres différents |
| 4,95 | le retard, découvert le 28. | court jusqu'au choc (7,45 s) |
| 7,55 | La fin de mois ? | juste après l'impact |
| — | *(silence)* | la rature barre « se négocie » |
| 9,10 | Elle se constate. | **au moment où ces mots montent à l'écran** |
| 10,45 | BD Report. | le logo vient de se poser |
| 12,60 | Rendez-vous, pipeline, primes, pilotage : un seul espace. | les quatre coches apparaissent |
| 17,00 | Chaque passage en SQL déclenche la prime, au barème du jour. | le compteur monte |
| 20,70 | Figée. | **le cadenas se ferme, déclic dans la musique** |
| 21,80 | Et une raison d'appeler, trouvée pour vous. | le signal Hexalog |
| 25,25 | Toute la prospection, et la rémunération qui va avec. | sur le fondu, puis le slogan à l'écran |
| 28,35 | Essayez la démo. | **le bouton « respire »** |

Trois répliques ont été COUPÉES en deux pour tomber sur leur image (le pivot, « Figée »,
l'appel à l'action) : d'une traite, elles débordaient — et surtout, elles tombaient à
côté du moment qu'elles devaient souligner.

## Refaire la vidéo

```bash
# une fois
python3 -m venv .venv-tts && .venv-tts/bin/pip install piper-tts
#  + la voix : vits-piper-fr_FR-siwis-medium.tar.bz2, sur
#    https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models
#    (fr_FR-siwis-medium.onnx et .onnx.json, à copier dans video/assets/voice/)
#    ⚠️ PAS la version v0.0.2 publiée par Piper : sa table de phonèmes ignore les nasales.

npm run video                       # musique + image (≈ 8 min) → bd-report-pub-30s.mp4
.venv-tts/bin/python video/voice.py # voix + mixage            → bd-report-pub-30s-voix.mp4
.venv-tts/bin/python video/voice.py --check   # prononciation et créneaux seulement
```

`ffmpeg` requis : celui du système, `npm i --no-save ffmpeg-static`, ou `FFMPEG=…`.

## Remplacer par une voix humaine

Enregistrez un `voix.wav` calé sur la vidéo (début à 0,0 s), déposez-le dans
`video/out/`, et reprenez la commande de mixage de `voice.py` (fin du fichier) : la
musique s'atténue automatiquement sous la voix (`sidechaincompress`) et le tout est
ramené à -14 LUFS, le niveau attendu par LinkedIn, YouTube et Instagram.
