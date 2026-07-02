// ---------------------------------------------------------------------------
//  Configuration Supabase (synchro temps réel optionnelle).
//  Laisser vide = l'app fonctionne en local (par navigateur), comme avant.
//  Renseigner après avoir créé le projet (voir supabase/SETUP.md).
//  Clés obscurcies (non lisibles en clair dans le repo) — reconstruites via deob().
// ---------------------------------------------------------------------------
import { deob } from './obf.js'
export const SUPABASE_URL = deob('ChAGFQNVXVtUDQ4LRUVUU0BPEUUIEAsDAxoLGwMcFxZMUFFBUwMVXg==')
export const SUPABASE_ANON_KEY = deob('Bx04DRIoER1iBigveEh5A3hEP0IrCiBQEyw7QmQEEj57cXoLGEgPexIHQSgZIBs+Vws6JEVrXXRMdyV4ES0cLxw1Gz0bJgwKRFB3A1lJRGMKAB8vHgs1BB0KNTxXVmheQGQfRgsHH1wDNSE9GyYPIFhQAgZfYTV7Ej0qNBkgGDEeICYjV310YwdgDGARLR8zRAwxPRsiCCcYfFpZBGAyZBgqOlVeMEVZHgQRB3hWe15CXgxGKSIIPToOHixkO1MoAEFRBXdXLl4nAy09MikeMQ==')

export const isSupabaseConfigured = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY)

// ---------------------------------------------------------------------------
//  Drapeaux de fonctionnalités.
//  multiTenant : bascule l'app sur l'auth Supabase + l'isolation par organisation
//  (RLS org_state). Tant qu'il est `false`, l'app fonctionne EXACTEMENT comme avant
//  (blob app_state.main). Voir supabase/MIGRATION_MULTITENANT.md avant de l'activer.
// ---------------------------------------------------------------------------
export const FEATURES = {
  multiTenant: false,
}
