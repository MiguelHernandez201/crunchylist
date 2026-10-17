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

-- Series descartadas: el usuario las quita de su lista y de la priorización.
-- No se borra nada: "restaurar" pone descartada = false. Mismo modelo de acceso que progreso (release 0.1).
create table if not exists public.descartadas (
  id          text primary key references public.series(id) on delete cascade,
  titulo      text,
  descartada  boolean not null default true,
  actualizado timestamptz not null default now()
);
alter table public.descartadas enable row level security;
grant select, insert, update on public.descartadas to anon, authenticated;
drop policy if exists "descartadas lectura"  on public.descartadas;
drop policy if exists "descartadas inserta"  on public.descartadas;
drop policy if exists "descartadas actualiza" on public.descartadas;
create policy "descartadas lectura" on public.descartadas
  for select to anon, authenticated using (true);
create policy "descartadas inserta" on public.descartadas
  for insert to anon, authenticated with check (true);
create policy "descartadas actualiza" on public.descartadas
  for update to anon, authenticated using (true) with check (true);

-- Administración del catálogo -------------------------------------------------
-- Solo los usuarios listados en public.admins pueden editar series. El rol anon nunca escribe.
-- Alta de un admin (después de crearlo en Authentication → Users):
--   insert into public.admins (user_id) values ('<uuid del usuario>');
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;
grant select on public.admins to authenticated;
drop policy if exists "admin ve su fila" on public.admins;
create policy "admin ve su fila" on public.admins
  for select to authenticated using (user_id = auth.uid());

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

-- Id de la serie en AniList (opcional). Sirve para proponer próximos episodios; no reemplaza al id de Crunchyroll.
alter table public.series add column if not exists anilist_id integer;
create unique index if not exists series_anilist_id_uq on public.series (anilist_id) where anilist_id is not null;

-- Edita solo campos permitidos: de series.data y la columna anilist_id. Devuelve series.data resultante.
create or replace function public.admin_actualizar_serie(p_id text, p_cambios jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  k text;
  v jsonb;
  resultado jsonb;
begin
  if not public.es_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' then
    raise exception 'Cambios inválidos';
  end if;
  for k, v in select * from jsonb_each(p_cambios) loop
    if k in ('total', 'totalTodas', 'nextEp', 'anilist_id') then
      if jsonb_typeof(v) not in ('number', 'null') or (jsonb_typeof(v) = 'number' and ((v::text)::numeric < 1 or (v::text)::numeric <> trunc((v::text)::numeric))) then
        raise exception 'El campo % debe ser un entero positivo o vacío', k;
      end if;
    elsif k = 'nextWhen' then
      if jsonb_typeof(v) not in ('string', 'null') then
        raise exception 'El campo nextWhen debe ser texto o vacío';
      end if;
    else
      raise exception 'Campo no editable: %', k;
    end if;
  end loop;
  update public.series
     set data = data || (p_cambios - 'anilist_id'),
         anilist_id = case when p_cambios ? 'anilist_id' then (p_cambios ->> 'anilist_id')::integer else anilist_id end,
         actualizado = now()
   where id = p_id
   returning data into resultado;
  if resultado is null then
    raise exception 'Serie no encontrada: %', p_id;
  end if;
  return resultado;
end $$;

-- Propuestas de cambio (las escribe la Edge Function anilist-propuestas; un admin las acepta o rechaza).
create table if not exists public.propuestas (
  id        bigint generated always as identity primary key,
  serie_id  text not null references public.series(id) on delete cascade,
  tipo      text not null check (tipo in ('vincular', 'episodio', 'finalizada')),
  propuesto jsonb not null,   -- vincular: {anilist_id,...} · episodio/finalizada: {nextEp,nextWhen} / {total,nextEp,nextWhen}
  actual    jsonb not null,   -- foto de los valores que había al proponer
  estado    text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'rechazada')),
  creada    timestamptz not null default now(),
  resuelta  timestamptz
);
create index if not exists propuestas_pendientes_idx on public.propuestas (estado, tipo);
alter table public.propuestas enable row level security;
grant select on public.propuestas to authenticated;
grant all on public.propuestas to service_role;
drop policy if exists "propuestas solo admin" on public.propuestas;
create policy "propuestas solo admin" on public.propuestas
  for select to authenticated using (public.es_admin());

create or replace function public.admin_resolver_propuesta(p_id bigint, p_aceptar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  pr public.propuestas;
begin
  if not public.es_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select * into pr from public.propuestas where id = p_id and estado = 'pendiente' for update;
  if not found then
    raise exception 'La propuesta no existe o ya fue resuelta';
  end if;
  if p_aceptar then
    if pr.tipo = 'vincular' then
      update public.series set anilist_id = (pr.propuesto ->> 'anilist_id')::integer, actualizado = now() where id = pr.serie_id;
    else
      if exists (select 1 from jsonb_object_keys(pr.propuesto) k where k not in ('total', 'nextEp', 'nextWhen')) then
        raise exception 'La propuesta trae campos no permitidos';
      end if;
      update public.series set data = data || pr.propuesto, actualizado = now() where id = pr.serie_id;
    end if;
  end if;
  update public.propuestas
     set estado = case when p_aceptar then 'aceptada' else 'rechazada' end, resuelta = now()
   where id = p_id;
end $$;

revoke all on function public.es_admin() from public, anon;
revoke all on function public.admin_actualizar_serie(text, jsonb) from public, anon;
grant execute on function public.es_admin() to authenticated;
grant execute on function public.admin_actualizar_serie(text, jsonb) to authenticated;
revoke all on function public.admin_resolver_propuesta(bigint, boolean) from public, anon;
grant execute on function public.admin_resolver_propuesta(bigint, boolean) to authenticated;

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

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'descartadas'
  ) then
    alter publication supabase_realtime add table public.descartadas;
  end if;
end $$;
