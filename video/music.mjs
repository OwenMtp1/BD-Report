// ---------------------------------------------------------------------------
//  BANDE-SON DE LA PUBLICITÉ — synthétisée, sans échantillon ni dépendance.
//
//    node video/music.mjs   → video/out/musique.wav (30 s, 44,1 kHz, stéréo)
//
//  ⚠️ Écrite CONTRE L'IMAGE, à la milliseconde. Les instants ci-dessous sont ceux de
//  `ad.html` : changer un moment de l'animation sans le reporter ici désynchronise
//  l'impact, les trois notes du logo et le déclic du cadenas. C'est voulu : un son
//  « posé dessus » ne fait pas du motion design, il fait une vidéo avec de la musique.
//
//  ⚠️ Mixée SOUS une voix : les médiums (1–3 kHz, là où vit l'intelligibilité de la
//  parole) restent dégagés et le niveau moyen est bas. La voix off s'ajoute par-dessus
//  sans retoucher ce fichier.
//
//  Aléa DÉTERMINISTE (mulberry32, graine fixe) : la même commande donne le même fichier.
// ---------------------------------------------------------------------------
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const SR = 44100
const DUR = 30
const N = SR * DUR
const L = new Float32Array(N), R = new Float32Array(N)
const RV = new Float32Array(N)                      // envoi vers la réverbération (mono)

let seed = 0x5eed1234
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
const hz = m => 440 * Math.pow(2, (m - 69) / 12)
const TAU = Math.PI * 2
const idx = s => Math.max(0, Math.min(N - 1, Math.round(s * SR)))
const put = (i, v, pan = 0, send = 0) => {
  if (i < 0 || i >= N) return
  L[i] += v * Math.cos((pan + 1) * Math.PI / 4)
  R[i] += v * Math.sin((pan + 1) * Math.PI / 4)
  RV[i] += v * send
}

// ---------------------------------------------------------------- Instruments
// Nappe : quelques harmoniques décroissantes, deux voix désaccordées pour la largeur,
// filtrée par un passe-bas à un pôle qui s'ouvre avec l'enveloppe.
function pad(t0, t1, notes, { gain = .05, attack = .6, release = .9, bright = .35, send = .5 } = {}) {
  const a = idx(t0), b = idx(t1 + release)
  notes.forEach((m, k) => {
    const pan = (k / Math.max(1, notes.length - 1)) * 1.2 - .6
    for (const det of [-0.06, 0.06]) {
      const f = hz(m + det)
      let lp = 0
      for (let i = a; i < b; i++) {
        const t = i / SR, u = t - t0
        const env = Math.min(1, u / attack) * (t > t1 ? Math.max(0, 1 - (t - t1) / release) : 1)
        let s = 0
        for (let h = 1; h <= 5; h++) s += Math.sin(TAU * f * h * u) / (h * h * .9)
        const c = .02 + bright * env * .12
        lp += c * (s - lp)
        put(i, lp * env * gain, pan * (det > 0 ? 1 : -1) * .7, send)
      }
    }
  })
}
function kick(t0, g = .55) {
  const a = idx(t0), n = idx(.45)
  for (let i = 0; i < n; i++) {
    const u = i / SR, f = 45 + 105 * Math.exp(-u * 32)
    put(a + i, Math.sin(TAU * (45 * u + 105 * (1 - Math.exp(-u * 32)) / 32)) * Math.exp(-u * 9) * g)
    void f
  }
}
function noiseHit(t0, { dur = .12, g = .2, hp = .85, pan = 0, send = .15, decay = 30 } = {}) {
  const a = idx(t0), n = idx(dur)
  let prev = 0, y = 0
  for (let i = 0; i < n; i++) {
    const x = rnd() * 2 - 1
    y = hp * (y + x - prev); prev = x          // passe-haut à un pôle
    put(a + i, y * Math.exp(-(i / SR) * decay) * g, pan, send)
  }
}
const hat = (t, g = .06, pan = .3) => noiseHit(t, { dur: .05, g, hp: .97, pan, decay: 90, send: .05 })
const clap = (t, g = .16) => { noiseHit(t, { dur: .18, g, hp: .9, decay: 22, send: .35 }); noiseHit(t + .012, { dur: .12, g: g * .7, hp: .9, decay: 30, send: .35 }) }
function pluck(t0, m, { g = .14, dur = .9, pan = 0, send = .45 } = {}) {
  const a = idx(t0), n = idx(dur), f = hz(m)
  for (let i = 0; i < n; i++) {
    const u = i / SR, env = Math.exp(-u * 5.5) * Math.min(1, u * 400)
    put(a + i, (Math.sin(TAU * f * u) + .35 * Math.sin(TAU * f * 2 * u) * Math.exp(-u * 9)) * env * g, pan, send)
  }
}
function sub(t0, t1, m, g = .16) {
  const a = idx(t0), b = idx(t1), f = hz(m)
  for (let i = a; i < b; i++) {
    const u = (i - a) / SR, env = Math.min(1, u * 20) * Math.min(1, (b - i) / SR * 8)
    put(i, Math.sin(TAU * f * u) * env * g)
  }
}

// ======================================================================
//  ACTE 1 — LE PROBLÈME (0 → 7,45 s) : tension en la mineur, une seconde
//  mineure qui frotte (si bémol), pouls cardiaque, tic-tac d'horloge.
// ======================================================================
pad(0.0, 6.9, [45, 52, 57, 58], { gain: .045, attack: 1.4, release: .5, bright: .2, send: .6 })
for (let b = 0; b < 12; b++) {                   // pouls : deux battements serrés, comme un cœur
  const t = .3 + b * .6
  if (t > 6.9) break
  sub(t, t + .16, 33, .2); sub(t + .2, t + .32, 33, .12)
}
for (let t = .3; t < 6.9; t += .3) hat(t, .022 + .025 * (t / 7), (Math.round(t / .3) % 2 ? .4 : -.4))   // l'horloge s'emballe
// Ponctuations sur les trois douleurs
pluck(1.78, 70, { g: .09, dur: .6, pan: .3 })   // le barème change sous nos yeux
pluck(5.95, 69, { g: .11, dur: 1.2, pan: -.2 }) // le 28 s'allume
pluck(5.95, 70, { g: .07, dur: 1.2, pan: .2 })  // … en dissonance

// Montée : bruit qui s'ouvre + glissando, jusqu'au choc.
{
  const a = idx(5.6), b = idx(7.45)
  let lp = 0, ph = 0
  for (let i = a; i < b; i++) {
    const p = (i - a) / (b - a)
    lp += (.01 + .25 * p * p) * ((rnd() * 2 - 1) - lp)
    ph += TAU * (180 + 1100 * p * p) / SR
    put(i, (lp * .5 + Math.sin(ph) * .05) * p * p * .55, Math.sin(p * 20) * .4, .3)
  }
}
// ======================================================================
//  IMPACT (7,45 s) — le chaos s'effondre en un point.
// ======================================================================
{
  const a = idx(7.45), n = idx(1.6)
  for (let i = 0; i < n; i++) {
    const u = i / SR
    put(a + i, Math.sin(TAU * (30 * u + 90 * (1 - Math.exp(-u * 14)) / 14)) * Math.exp(-u * 2.6) * .7, 0, .25)
  }
  noiseHit(7.45, { dur: .9, g: .28, hp: .6, decay: 6, send: .8 })
}

// ======================================================================
//  ACTES 2-3 — LA RÉSOLUTION, en do majeur. Fa → Do → Sol → La m, deux fois.
//  Une mesure = 4 temps à 100 BPM = 2,4 s.
// ======================================================================
const BEAT = .6, BAR = 2.4
const CHORDS = [[53, 57, 60, 64], [48, 55, 60, 64], [55, 59, 62, 67], [57, 60, 64, 69]]   // F, C, G, Am
const BASS = [41, 36, 43, 45]
const START = 7.75
for (let k = 0; k < 8; k++) {
  const t0 = START + k * BAR, t1 = Math.min(t0 + BAR, 25.8)
  if (t0 >= 25.8) break
  pad(t0, t1, CHORDS[k % 4], { gain: .04, attack: .35, release: .5, bright: .45, send: .55 })
  sub(t0, t1 - .05, BASS[k % 4] - 12, .15)
}
// Rythmique : discrète sous le pivot et la marque, pleine à partir des preuves.
for (let t = START; t < 25.7; t += BEAT) {
  const full = t >= 12.4
  const beat = Math.round((t - START) / BEAT)
  if (beat % 2 === 0) kick(t, full ? .5 : .32)
  if (full && beat % 2 === 1) clap(t)
  hat(t + BEAT / 2, full ? .05 : .03, beat % 2 ? .35 : -.35)
}
// Arpège d'accompagnement sous les preuves (doubles croches discrètes).
for (let t = 12.4, s = 0; t < 25.6; t += BEAT / 2, s++) {
  const ch = CHORDS[Math.floor((t - START) / BAR) % 4]
  pluck(t, ch[s % 4] + 12, { g: .045, dur: .35, pan: (s % 2 ? .45 : -.45), send: .5 })
}

// ======================================================================
//  SOUND DESIGN SYNCHRONISÉ À L'IMAGE
// ======================================================================
// Le logo : trois barres qui montent = trois notes qui montent, puis le point mint.
;[[10.45, 72], [10.55, 76], [10.65, 79]].forEach(([t, m], i) => pluck(t, m, { g: .16, dur: 1.1, pan: (i - 1) * .35, send: .6 }))
pluck(10.85, 84, { g: .12, dur: 1.4, send: .7 })
// La prime se FIGE : déclic sec du cadenas, puis un carillon. Sur le mot « Figée » (20,7 s)
// et sur l'animation du cadenas dans ad.html — les trois bougent ENSEMBLE.
noiseHit(20.72, { dur: .025, g: .5, hp: .5, decay: 220, send: .1 })
pluck(20.75, 79, { g: .12, dur: 1.4, pan: -.2, send: .6 }); pluck(20.75, 84, { g: .1, dur: 1.6, pan: .2, send: .6 })
// Le score du signal monte : un « ping » quand il atteint sa valeur.
pluck(24.6, 88, { g: .08, dur: .9, send: .6 })
// Transitions entre preuves : un souffle.
;[12.35, 16.9, 21.5].forEach(t => noiseHit(t, { dur: .55, g: .07, hp: .92, decay: 6, send: .5 }))

// ======================================================================
//  APPEL À L'ACTION — résolution en do majeur, tenue jusqu'au fondu.
// ======================================================================
pad(25.8, 29.4, [48, 55, 60, 64, 67], { gain: .05, attack: .5, release: .6, bright: .55, send: .7 })
sub(25.8, 29.4, 36, .14)
kick(25.8, .55)
;[[26.1, 72], [26.3, 76], [26.5, 79], [26.7, 84]].forEach(([t, m], i) => pluck(t, m, { g: .1, dur: 1.4, pan: (i - 1.5) * .3, send: .7 }))
pluck(28.4, 84, { g: .08, dur: 1.5, send: .7 })   // le bouton « respire »

// ---------------------------------------------------------------- Réverbération
// Schroeder : quatre peignes en parallèle, deux passe-tout en série. Légère : elle
// donne de l'espace, elle ne doit pas brouiller la voix qui viendra par-dessus.
{
  const combs = [1557, 1617, 1491, 1422].map(d => ({ d, buf: new Float32Array(d), i: 0, lp: 0 }))
  const aps = [225, 556].map(d => ({ d, buf: new Float32Array(d), i: 0 }))
  for (let n = 0; n < N; n++) {
    let x = RV[n] * .25, y = 0
    for (const c of combs) {
      const o = c.buf[c.i]; c.lp = o * .7 + c.lp * .3
      c.buf[c.i] = x + c.lp * .78; c.i = (c.i + 1) % c.d; y += o
    }
    for (const a of aps) { const o = a.buf[a.i]; const v = y + o * -.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.d; y = o + v * .5 }
    L[n] += y * .55; R[n] += y * .5
  }
}

// ---------------------------------------------------------------- Mastering
// Fondu final calé sur l'image (29,55 → 30 s), saturation douce, crête à -1 dBFS.
for (let n = 0; n < N; n++) {
  const t = n / SR
  const fade = Math.min(1, t / .05) * (t > 29.4 ? Math.max(0, 1 - (t - 29.4) / .6) : 1)
  L[n] = Math.tanh(L[n] * 1.6 * fade); R[n] = Math.tanh(R[n] * 1.6 * fade)
}
let peak = 0
for (let n = 0; n < N; n++) peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]))
const norm = .89 / (peak || 1)

// ---------------------------------------------------------------- WAV 16 bits stéréo
const out = Buffer.alloc(44 + N * 4)
out.write('RIFF', 0); out.writeUInt32LE(36 + N * 4, 4); out.write('WAVE', 8)
out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22)
out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34)
out.write('data', 36); out.writeUInt32LE(N * 4, 40)
let sq = 0
for (let n = 0; n < N; n++) {
  const l = L[n] * norm, r = R[n] * norm
  sq += l * l + r * r
  out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, l)) * 32767), 44 + n * 4)
  out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, r)) * 32767), 46 + n * 4)
}
const dir = path.resolve('video/out')
await mkdir(dir, { recursive: true })
await writeFile(path.join(dir, 'musique.wav'), out)
const rms = Math.sqrt(sq / (2 * N))
console.log(`✓ video/out/musique.wav — ${DUR} s, crête -1 dBFS, niveau moyen ${(20 * Math.log10(rms)).toFixed(1)} dBFS`)
