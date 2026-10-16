-- CrunchyList — esquema de Supabase (release 0.1)
-- Idempotente: se puede ejecutar varias veces.

-- Catálogo de series. Hoy mezcla datos de la serie (episodios, doblaje, emisión)
-- con datos del watchlist (addedPos, st). Se separan en una release futura (ver docs/RELEASES.md).
create table if not exists public.series (
  id          text primary key,            -- id de Crunchyroll (ej. GT00371926)
  titulo      text not null,
  thumb       text,                        -- ruta relativa de la miniatura (ej. thumbs135/42.png)
  data        jsonb not null,              -- objeto completo de la serie
  actualizado timestamptz not null default now()
);

-- Progreso manual (capítulos vistos). Sin usuario por ahora: un solo watchlist.
create table if not exists public.progreso (
  id          text primary key references public.series(id) on delete cascade,
  titulo      text,
  vistos      integer not null check (vistos >= 0),
  actualizado timestamptz not null default now()
);

alter table public.series   enable row level security;
alter table public.progreso enable row level security;

grant select                 on public.series   to anon, authenticated;
grant select, insert, update on public.progreso to anon, authenticated;

drop policy if exists "series lectura"                       on public.series;
drop policy if exists "progreso lectura"                     on public.progreso;
drop policy if exists "progreso escribe usuario autenticado" on public.progreso;
drop policy if exists "progreso inserta con el link"         on public.progreso;
drop policy if exists "progreso actualiza con el link"       on public.progreso;

-- series: solo lectura desde la app; se escribe con el seed (rol postgres/service_role).
create policy "series lectura" on public.series
  for select to anon, authenticated using (true);

-- progreso: release 0.1 = quien tenga el link puede escribir (decisión consciente).
-- Sin DELETE. Se reemplaza por políticas con auth.uid() cuando haya login.
create policy "progreso lectura" on public.progreso
  for select to anon, authenticated using (true);
create policy "progreso inserta con el link" on public.progreso
  for insert to anon, authenticated with check (true);
create policy "progreso actualiza con el link" on public.progreso
  for update to anon, authenticated using (true) with check (true);

-- Realtime: cambios de progreso se reflejan en otras pestañas/dispositivos abiertos.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'progreso'
  ) then
    alter publication supabase_realtime add table public.progreso;
  end if;
end $$;
