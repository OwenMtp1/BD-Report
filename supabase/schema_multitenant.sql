-- ============================================================================
--  BD Report — Schéma MULTI-TENANT (cible)
--  Supabase Auth + RLS par organisation (société cliente).
--  ⚠️ NE PAS exécuter sur la base de prod sans avoir lu MIGRATION_MULTITENANT.md
--     et fait une SAUVEGARDE du blob `app_state` actuel.
--
--  Modèle :
--    auth.users (Supabase Auth)  ─1:1─  profiles
--    orgs (société cliente, ≈ "environment" actuel)
--    org_members (qui appartient à quelle org + rôle)
--    org_state (état JSONB PAR org : ses espaces + données) ← isolé par RLS
--
--  Isolation : un utilisateur ne peut lire/écrire QUE les org_state des orgs
--  dont il est membre. L'équipe plateforme (BD Report) voit tout via un flag.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- Profils
-- Profil applicatif lié 1:1 à un compte Supabase Auth.
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  pseudo            text unique,
  email             text,
  full_name         text,
  photo             text,
  is_platform_admin boolean not null default false,   -- équipe BD Report : accès transverse
  prefs             jsonb   not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------- Organisations
-- Une organisation = une société cliente (le "locataire"/tenant).
create table if not exists public.orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  plan        text not null default 'beta',
  meta        jsonb not null default '{}'::jsonb,      -- logo, réglages d'org…
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- Appartenances
create table if not exists public.org_members (
  org_id     uuid not null references public.orgs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'Membre',
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists idx_org_members_user on public.org_members (user_id);

-- ---------------------------------------------------------------- État par org
-- Toutes les données métier d'une org (ses subenvs + data[subId]) en JSONB.
create table if not exists public.org_state (
  org_id     uuid primary key references public.orgs(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- Helpers RLS
-- SECURITY DEFINER pour éviter la récursion de policies (la fonction lit les
-- tables sans re-déclencher la RLS de l'appelant).
create or replace function public.is_org_member(o uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members m where m.org_id = o and m.user_id = auth.uid());
$$;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_platform_admin from public.profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------- RLS
alter table public.profiles    enable row level security;
alter table public.orgs        enable row level security;
alter table public.org_members enable row level security;
alter table public.org_state   enable row level security;

-- profiles : chacun gère le sien ; l'admin plateforme lit tout.
drop policy if exists profiles_read on public.profiles;
drop policy if exists profiles_ins  on public.profiles;
drop policy if exists profiles_upd  on public.profiles;
create policy profiles_read on public.profiles for select using (id = auth.uid() or public.is_platform_admin());
create policy profiles_ins  on public.profiles for insert with check (id = auth.uid());
create policy profiles_upd  on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- orgs : visibles par leurs membres ; gérables par l'admin plateforme.
drop policy if exists orgs_read  on public.orgs;
drop policy if exists orgs_admin on public.orgs;
create policy orgs_read  on public.orgs for select using (public.is_org_member(id) or public.is_platform_admin());
create policy orgs_admin on public.orgs for all    using (public.is_platform_admin()) with check (public.is_platform_admin());

-- org_members : un membre voit la composition de ses orgs ; l'admin gère tout.
drop policy if exists om_read  on public.org_members;
drop policy if exists om_admin on public.org_members;
create policy om_read  on public.org_members for select using (public.is_org_member(org_id) or public.is_platform_admin());
create policy om_admin on public.org_members for all    using (public.is_platform_admin()) with check (public.is_platform_admin());

-- org_state : cœur de l'isolation — SEULS les membres de l'org y accèdent.
drop policy if exists os_read  on public.org_state;
drop policy if exists os_upd   on public.org_state;
drop policy if exists os_ins   on public.org_state;
create policy os_read on public.org_state for select using (public.is_org_member(org_id) or public.is_platform_admin());
create policy os_upd  on public.org_state for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy os_ins  on public.org_state for insert with check (public.is_org_member(org_id) or public.is_platform_admin());

-- ---------------------------------------------------------------- Temps réel
-- ⚠️ SEULE ligne du fichier qui n'était pas rejouable, et elle échouait pour une
-- raison qui n'est PAS une panne : si la publication `supabase_realtime` du projet
-- est déclarée FOR ALL TABLES, la table en fait partie à la seconde où elle est
-- créée — `add table` répond alors « already member » (42710) et fait tomber tout
-- le script, y compris le déclencheur d'auto-profil qui le suit. Même chose à la
-- deuxième exécution d'un fichier pourtant conçu pour être rejoué.
-- On ajoute donc la table SI elle n'y est pas déjà, et on ne fait rien sinon.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'org_state')
  then
    alter publication supabase_realtime add table public.org_state;
  end if;
end $$;

-- ---------------------------------------------------------------- Auto-profil
-- À la création d'un compte Auth, crée le profil correspondant.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, pseudo)
  values (new.id, new.email, split_part(coalesce(new.email,''), '@', 1))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
