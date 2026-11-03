-- HISTÓRICO: esquema viejo, sin cuentas. No correr: usar docs/supabase-cuentas.sql.
do $$ begin raise exception 'Script histórico: no correr. Usar docs/supabase-cuentas.sql'; end $$;

-- Garaje 1:64 · ejecutar UNA vez en Supabase → SQL Editor → Run
-- Crea la tabla del garaje y dos funciones. Nadie puede leer ni tocar la tabla directo:
-- solo se lee o guarda un garaje si se conoce su código (un UUID imposible de adivinar).

create table if not exists public.garajes (
  id uuid primary key default gen_random_uuid(),
  autos jsonb not null default '[]'::jsonb,
  fondo text not null default 'pista',
  actualizado timestamptz not null default now()
);
alter table public.garajes enable row level security;
revoke all on public.garajes from anon, authenticated;

create or replace function public.leer_garaje(p_id uuid)
returns table (autos jsonb, fondo text, actualizado timestamptz)
language sql stable security definer set search_path = public
as $$ select g.autos, g.fondo, g.actualizado from public.garajes g where g.id = p_id $$;

create or replace function public.guardar_garaje(p_id uuid, p_autos jsonb, p_fondo text)
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare v timestamptz;
begin
  if jsonb_typeof(p_autos) <> 'array' or jsonb_array_length(p_autos) > 300
     or octet_length(p_autos::text) > 200000 then
    raise exception 'lista inválida';
  end if;
  if exists (select 1 from jsonb_array_elements(p_autos) e
             where jsonb_typeof(e) <> 'object'
                or jsonb_typeof(e->'titulo') <> 'string'
                or length(e->>'titulo') > 200) then
    raise exception 'auto inválido';
  end if;
  if p_fondo is null or p_fondo !~ '^(pista|taller|noche|desierto|estudio|propio)$' then
    p_fondo := 'pista';
  end if;
  update public.garajes set autos = p_autos, fondo = p_fondo, actualizado = now()
   where id = p_id returning actualizado into v;
  if v is null then raise exception 'garaje no existe'; end if;
  return v;
end $$;

revoke all on function public.leer_garaje(uuid) from public;
revoke all on function public.guardar_garaje(uuid, jsonb, text) from public;
grant execute on function public.leer_garaje(uuid) to anon;
grant execute on function public.guardar_garaje(uuid, jsonb, text) to anon;

-- Crea el garaje del regalo y muestra el enlace que le vas a mandar a tu amigo
insert into public.garajes default values
returning 'https://dnaffah.github.io/garaje-diecast/?g=' || id as enlace_del_regalo;
