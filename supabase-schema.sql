-- ============================================================
--  Calculatrice Patrimoniale — schéma Supabase
--  À exécuter dans Supabase → SQL Editor → New query → Run.
--  Crée la table des simulations enregistrées + sécurité (RLS) :
--  chaque utilisateur ne voit/édite QUE ses propres données.
-- ============================================================

create table if not exists public.simulations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  screen      text not null,
  label       text not null,
  payload     jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists simulations_user_idx on public.simulations(user_id, created_at desc);

alter table public.simulations enable row level security;

drop policy if exists "own_select" on public.simulations;
drop policy if exists "own_insert" on public.simulations;
drop policy if exists "own_delete" on public.simulations;

create policy "own_select" on public.simulations
  for select using (auth.uid() = user_id);
create policy "own_insert" on public.simulations
  for insert with check (auth.uid() = user_id);
create policy "own_delete" on public.simulations
  for delete using (auth.uid() = user_id);

-- ============================================================
--  Comptes : essai 30 jours + abonnement (5 €/mois)
-- ============================================================
create table if not exists public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text,
  trial_start         timestamptz not null default now(),
  subscription_status text not null default 'trial',     -- trial | active | canceled | expired
  plan                text default 'all',                -- immo | all
  current_period_end  timestamptz,
  stripe_customer_id  text,
  created_at          timestamptz not null default now()
);

alter table public.profiles enable row level security;
drop policy if exists "own_profile_select" on public.profiles;
drop policy if exists "own_profile_insert" on public.profiles;
create policy "own_profile_select" on public.profiles for select using (auth.uid() = id);
create policy "own_profile_insert" on public.profiles for insert with check (auth.uid() = id);
-- (les mises à jour d'abonnement sont faites par le webhook Stripe avec la clé service_role,
--  qui contourne la RLS — aucune policy "update" n'est donc ouverte aux utilisateurs.)

-- Création automatique du profil (et démarrage de l'essai) à l'inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute procedure public.handle_new_user();
