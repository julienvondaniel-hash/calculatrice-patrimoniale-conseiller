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
