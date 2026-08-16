-- RLS politike za tabelu "projects"
-- Problem: RLS je uključen ali nema INSERT/UPDATE/DELETE politike,
-- pa Supabase odbija dodavanje/izmenu redova (SQLSTATE 42501).
--
-- Ova skripta dozvoljava pisanje SAMO editoru (mirror frontend EDIT_USERS gejta),
-- na osnovu email claim-a iz JWT-a. Čitanje ostaje kako jeste.
--
-- Pokreni u: Supabase Dashboard -> SQL Editor -> New query
-- Projekat: iubmdftpbvxrexteasdn

-- (RLS je već uključen; ostavljeno radi idempotentnosti)
alter table public.projects enable row level security;

-- INSERT
drop policy if exists "editor can insert projects" on public.projects;
create policy "editor can insert projects"
  on public.projects
  for insert
  to authenticated
  with check ( (auth.jwt() ->> 'email') = 'nikola.miladinovic@cwp.global' );

-- UPDATE
drop policy if exists "editor can update projects" on public.projects;
create policy "editor can update projects"
  on public.projects
  for update
  to authenticated
  using      ( (auth.jwt() ->> 'email') = 'nikola.miladinovic@cwp.global' )
  with check ( (auth.jwt() ->> 'email') = 'nikola.miladinovic@cwp.global' );

-- DELETE
drop policy if exists "editor can delete projects" on public.projects;
create policy "editor can delete projects"
  on public.projects
  for delete
  to authenticated
  using ( (auth.jwt() ->> 'email') = 'nikola.miladinovic@cwp.global' );

-- Napomena: za više editora zameni uslov sa npr.:
--   (auth.jwt() ->> 'email') in ('nikola.miladinovic@cwp.global','drugi@cwp.global')
