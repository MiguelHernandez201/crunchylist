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

-- Edita solo campos permitidos de series.data. Devuelve el objeto resultante.
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
    if k in ('total', 'totalTodas', 'nextEp') then
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
     set data = data || p_cambios, actualizado = now()
   where id = p_id
   returning data into resultado;
  if resultado is null then
    raise exception 'Serie no encontrada: %', p_id;
  end if;
  return resultado;
end $$;

revoke all on function public.es_admin() from public, anon;
revoke all on function public.admin_actualizar_serie(text, jsonb) from public, anon;
grant execute on function public.es_admin() to authenticated;
grant execute on function public.admin_actualizar_serie(text, jsonb) to authenticated;

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
