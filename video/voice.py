# ---------------------------------------------------------------------------
#  VOIX OFF DE LA PUBLICITÉ — synthèse locale (Piper), puis mixage sur la musique.
#
#    python video/voice.py            → video/out/voix.wav
#    python video/voice.py --check    → prononciation et créneaux seulement (rapide)
#                                       video/out/bd-report-pub-30s-voix.mp4
#
#  Prérequis (une fois) :
#    python3 -m venv .venv-tts && .venv-tts/bin/pip install piper-tts
#    + la voix « siwis medium » : voice-fr-siwis-medium.tar.gz, publiée par Piper sur
#      https://github.com/rhasspy/piper/releases/tag/v0.0.2, extraite dans
#      video/assets/voice/ (ou PIPER_VOICE=/chemin/vers/fr-siwis-medium.onnx).
#    + ffmpeg (variable FFMPEG, sinon celui du système).
#
#  🔑 LICENCE : la voix est entraînée sur le corpus SIWIS, CC BY 4.0 — usage commercial
#  permis, CRÉDIT OBLIGATOIRE (voir voix-off.md). Écartés exprès : les outils gratuits qui
#  passent par les voix de Microsoft ou Google en contournant leur API (edge-tts…). La
#  voix y est meilleure, mais le droit de la diffuser dans une publicité n'est pas accordé.
#
#  ⚠️ LE TEXTE NE VIT PAS ICI. Il est lu dans le .srt, lui-même GÉNÉRÉ depuis
#  `window.VO` (video/ad.html) par render.mjs : sous-titres, voix et timecodes ne
#  peuvent donc pas diverger. Lancer `node video/render.mjs` d'abord.
# ---------------------------------------------------------------------------
import os, re, subprocess, sys, wave
from pathlib import Path

import numpy as np
from piper import PiperVoice, SynthesisConfig

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'out'
SRT = OUT / 'bd-report-pub-30s.srt'
VIDEO = OUT / 'bd-report-pub-30s.mp4'
MUSIC = OUT / 'musique.wav'
DURATION = 30.0

# ---------------------------------------------------------------- Prononciation
# ⚠️ CE QUE L'ÉCRAN AFFICHE N'EST PAS CE QUE LA VOIX DOIT LIRE. Le phonétiseur (espeak)
# lit « BD » comme l'abréviation de BOULEVARD : sans cette table, la publicité disait
# « Boulevard Report » à la place de la marque. Trouvé en lisant les phonèmes, avant
# toute synthèse — aucun test sur le texte ne l'aurait vu.
# Chaque graphie a été choisie EN LISANT le résultat phonétique, pas à l'oreille :
#   « Bi Di Riporte »   → bˈi dˈi ʁipˈɔʁt   (« Ripôrt » perdait le t final)
#   « paille-plaillne » → pˈajplˈajn         (« pipeline » sortait « pip-line », à la française)
SPOKEN = {
    'BD Report': 'Bi Di Riporte',
    'pipeline': 'paille-plaillne',
}
# Ce que le phonétiseur ne doit JAMAIS produire. Si l'un de ces motifs revient — une
# nouvelle réplique, une autre voix, une mise à jour d'espeak — on refuse de générer.
FORBIDDEN = {
    'bulvaʁ': '« BD » lu comme « boulevard »',
    'piplˈin': '« pipeline » lu à la française',
}
REQUIRED = {  # si l'écran dit X, la voix doit contenir Y
    'BD Report': 'bˈi dˈi ʁipˈɔʁt',
}

# ---------------------------------------------------------------- Rythme
GAP = 0.16          # entre deux phrases d'une même réplique
GAP_QUESTION = 0.48 # après un « ? » : la pause du pivot (« La fin de mois ? … Elle se constate. »)
MIN_SCALE = 0.84    # en dessous, la voix se précipite : mieux vaut réécrire la réplique
MARGIN = 0.08       # la voix se tait un peu avant la fin du sous-titre


def srt_lines(path):
    blocks = path.read_text(encoding='utf-8').strip().split('\n\n')
    ts = lambda s: (lambda h, m, rest: int(h) * 3600 + int(m) * 60 + float(rest.replace(',', '.')))(*s.split(':'))
    for b in blocks:
        rows = b.strip().split('\n')
        a, z = [ts(x.strip()) for x in rows[1].split('-->')]
        yield a, z, ' '.join(rows[2:])


def spoken(text):
    for k, v in SPOKEN.items():
        text = text.replace(k, v)
    return text


def check_phonemes(voice, shown, said):
    ph = ' '.join(''.join(s) for s in voice.phonemize(said))
    for bad, why in FORBIDDEN.items():
        if bad in ph:
            sys.exit(f'✖ prononciation : {why}\n  réplique : « {shown} »\n  phonèmes : {ph}')
    for word, need in REQUIRED.items():
        if word in shown and need not in ph:
            sys.exit(f'✖ prononciation : « {word} » ne donne pas {need}\n  phonèmes : {ph}')
    return ph


def synth(voice, text, scale):
    """Une réplique → (signal float32, fréquence). Phrase par phrase, pour maîtriser les pauses."""
    parts = [p for p in re.split(r'(?<=[.?!…])\s+', text) if p.strip()]
    out, sr = [], voice.config.sample_rate
    for i, p in enumerate(parts):
        # ⚠️ `noise_w_scale=0` : le RYTHME de Piper est tiré au hasard à chaque synthèse. Une
        # réplique tenait dans son créneau à un passage et le débordait au suivant. À zéro, la
        # durée est celle, moyenne, que prédit le modèle — la même à chaque fois. Le timbre
        # (`noise_scale`) garde un peu de variation : la forme d'onde change d'un passage à
        # l'autre, les durées et donc le calage, jamais.
        cfg = SynthesisConfig(length_scale=scale, noise_scale=0.55, noise_w_scale=0.0)
        audio = np.concatenate([c.audio_float_array for c in voice.synthesize(p, cfg)])
        out.append(audio)
        if i < len(parts) - 1:
            out.append(np.zeros(int(sr * (GAP_QUESTION if p.rstrip().endswith('?') else GAP)), np.float32))
    return np.concatenate(out), sr


def main():
    if not SRT.exists():
        sys.exit('✖ sous-titres absents — lancer `node video/render.mjs` d’abord.')
    model = os.environ.get('PIPER_VOICE') or str(ROOT / 'assets/voice/fr_FR-siwis-medium.onnx')
    if not Path(model).exists():
        sys.exit(f'✖ voix introuvable : {model} (voir l’en-tête de ce fichier)')
    voice = PiperVoice.load(model)
    sr = voice.config.sample_rate
    track = np.zeros(int(DURATION * sr), np.float32)

    print(f'Voix : {Path(model).name} ({sr} Hz)\n')
    for a, z, shown in srt_lines(SRT):
        said = spoken(shown)
        ph = check_phonemes(voice, shown, said)
        room = (z - a) - MARGIN
        # Trop long : on resserre le débit, PAR APPROCHES SUCCESSIVES. Accélérer ne comprime que
        # les phonèmes, pas les pauses : demander 6 % donnait moins, et le script annonçait la
        # « vitesse maximale » sans l'avoir atteinte.
        scale = 1.0
        audio, _ = synth(voice, said, scale)
        for _ in range(5):
            if len(audio) / sr <= room or scale <= MIN_SCALE:
                break
            scale = max(MIN_SCALE, scale * room / (len(audio) / sr) * 0.99)
            audio, _ = synth(voice, said, scale)
        dur = len(audio) / sr
        if dur > room + 0.05:
            sys.exit(f'✖ « {shown} » ne tient pas dans son créneau ({dur:.2f} s pour {room:.2f} s) '
                     f'même à la vitesse maximale (×{1/MIN_SCALE:.2f}) — raccourcir la réplique dans ad.html.')
        i = int(a * sr)
        track[i:i + len(audio)] += audio[: len(track) - i]
        print(f'  {a:5.2f} s  {dur:4.2f}/{room:4.2f} s  ×{1/scale:.2f}  « {shown} »')
        print(f'           {ph}')

    OUT.mkdir(exist_ok=True)
    peak = float(np.max(np.abs(track))) or 1.0
    pcm = (np.clip(track / peak * 0.89, -1, 1) * 32767).astype('<i2')
    with wave.open(str(OUT / 'voix.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(pcm.tobytes())
    print('\n✓ video/out/voix.wav')
    if '--check' in sys.argv:   # prononciation + créneaux seulement, sans mixage
        return

    # ------------------------------------------------------------ Mixage
    # La musique part du WAV d'origine, pas de la piste AAC de la vidéo : encoder deux fois
    # en AAC dégrade le son pour rien. La vidéo, elle, est COPIÉE (aucun réencodage).
    #  · voix : coupe-bas à 90 Hz (souffle, grondements), compression douce pour l'égaliser ;
    #  · musique : `sidechaincompress` l'ABAISSE pendant que la voix parle et la rend dans
    #    les silences — c'est ce qui rend une voix intelligible sur une musique ;
    #  · le tout ramené à -14 LUFS, le niveau attendu par LinkedIn, YouTube et Instagram.
    ff = os.environ.get('FFMPEG', 'ffmpeg')
    graph = (
        '[2:a]aresample=44100,highpass=f=90,acompressor=threshold=-20dB:ratio=3:attack=5:release=80,'
        'pan=stereo|c0=c0|c1=c0,asplit=2[v1][v2];'
        '[1:a][v1]sidechaincompress=threshold=0.02:ratio=10:attack=12:release=320[mus];'
        '[mus]volume=0.8[mus2];'
        '[mus2][v2]amix=inputs=2:normalize=0:duration=first[mix];'
        '[mix]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=44100[a]'
    )
    dest = OUT / 'bd-report-pub-30s-voix.mp4'
    subprocess.run([ff, '-hide_banner', '-loglevel', 'error', '-y',
                    '-i', str(VIDEO), '-i', str(MUSIC), '-i', str(OUT / 'voix.wav'),
                    '-filter_complex', graph, '-map', '0:v', '-map', '[a]',
                    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
                    str(dest)], check=True)
    print(f'✓ {dest.relative_to(ROOT.parent)}')


if __name__ == '__main__':
    main()
