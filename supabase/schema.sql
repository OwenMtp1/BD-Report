-- ============================================================================
--  BD Report — Schéma Supabase
--  À exécuter une seule fois dans Supabase → SQL Editor → New query → Run.
-- ============================================================================

-- 1) État applicatif partagé : toute l'app (comptes, environnements, espaces,
--    RDV, leads, notes, primes, support, projets…) est stockée dans une ligne
--    JSONB unique et synchronisée en temps réel sur tous les appareils.
create table if not exists public.app_state (
  id          text primary key,
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- 2) Demandes du formulaire de contact du site (insert anonyme depuis le site
--    public ; l'app les récupère dans « Nouvelles demandes »).
create table if not exists public.contact_requests (
  id          text primary key,
  name        text,
  email       text,
  message     text,
  lang        text default 'fr',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
--  Sécurité (Row Level Security)
-- ---------------------------------------------------------------------------
alter table public.app_state        enable row level security;
alter table public.contact_requests enable row level security;

-- NOTE BÊTA : l'application gère sa propre authentification interne (comptes
-- dans le JSONB) ; on autorise donc l'accès via la clé anon publique.
-- ⚠️ La clé anon permet alors de lire/écrire l'état partagé. C'est acceptable
-- pour une bêta privée. Pour durcir : migrer vers Supabase Auth + une RLS par
-- locataire (voir SETUP.md, section « Durcissement »).

drop policy if exists "app_state_read"   on public.app_state;
drop policy if exists "app_state_insert" on public.app_state;
drop policy if exists "app_state_update" on public.app_state;
create policy "app_state_read"   on public.app_state for select using (true);
create policy "app_state_insert" on public.app_state for insert with check (true);
create policy "app_state_update" on public.app_state for update using (true) with check (true);

drop policy if exists "contact_insert" on public.contact_requests;
drop policy if exists "contact_read"   on public.contact_requests;
create policy "contact_insert" on public.contact_requests for insert with check (true);
create policy "contact_read"   on public.contact_requests for select using (true);

-- ---------------------------------------------------------------------------
--  Temps réel
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.app_state;
alter publication supabase_realtime add table public.contact_requests;
