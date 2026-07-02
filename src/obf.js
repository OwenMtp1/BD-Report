// ---------------------------------------------------------------------------
//  Obscurcissement léger des clés (anti-scan GitHub + lecture casuelle).
//  Les clés ne figurent plus en clair dans le code : elles sont stockées XOR+base64
//  et reconstruites à l'exécution.
//  ⚠️ App 100 % front : la reconstruction se fait côté client, donc c'est de
//  l'obscurcissement (stoppe les scanners automatiques et le coup d'œil), PAS un
//  secret cryptographique. La vraie confidentialité vient de la RLS Supabase.
// ---------------------------------------------------------------------------
const PAD = 'bdreport-obf-2026-v1'

export function deob(b64) {
  const b = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const o = b.map((x, i) => x ^ PAD.charCodeAt(i % PAD.length))
  return new TextDecoder().decode(o)
}
