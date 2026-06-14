// ---------------------------------------------------------------------------
//  Configuration Supabase (synchro temps réel optionnelle).
//  Laisser vide = l'app fonctionne en local (par navigateur), comme avant.
//  Renseigner après avoir créé le projet (voir supabase/SETUP.md).
//  La clé anon est PUBLIQUE (protégée par RLS) : elle peut figurer ici.
// ---------------------------------------------------------------------------
export const SUPABASE_URL = ''
export const SUPABASE_ANON_KEY = ''

export const isSupabaseConfigured = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY)
