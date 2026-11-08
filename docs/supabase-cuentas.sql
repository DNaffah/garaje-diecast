-- Garaje 1:64 · cuentas de usuario. Pegar en Supabase → SQL Editor → Run, una sola vez
-- (si se corre otra vez no pasa nada). Cada garaje pasa a tener dueño y solo su dueño lo
-- puede leer o cambiar. La página ya no habla con Supabase; lo hace el servidor de
-- Cloudflare con la sesión de cada persona. NO correr después los scripts de docs/historico/.

-- 1. Cada garaje pasa a tener dueño (una cuenta = un garaje).
alter table public.garajes add column if not exists dueno uuid unique references auth.users(id) on delete cascade;
alter table public.garajes enable row level security;
revoke all on public.garajes from anon, authenticated;

-- 2. Se apaga el acceso anónimo por código. El garaje del regalo no se borra: queda
--    esperando a que tu amigo lo reclame con su cuenta (paso 5).
drop function if exists public.leer_garaje(uuid);
drop function if exists public.guardar_garaje(uuid, jsonb, text);

-- 3. ¿La sesión está viva y tiene el nivel que le toca? La sesión tiene que seguir abierta
--    en Supabase (un token robado deja de servir al cerrar sesión) y, si la cuenta activó
--    2FA, tiene que haber pasado por el código (aal2). Se revisa aquí, no en la página.
create or replace function public.sesion_completa()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
    and exists (select 1 from auth.sessions s
                 where s.id = nullif(auth.jwt()->>'session_id', '')::uuid and s.user_id = auth.uid())
    and (coalesce(auth.jwt()->>'aal', '') = 'aal2'
         or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'))
$$;

-- 4. Solo fotos de Fandom o Wikimedia, años de 4 cifras, textos con largo máximo y nada
--    de campos extra. (Postgres no acepta repeticiones de más de 255 en una regex: el
--    largo de las URLs se mide aparte.)
create or replace function public.autos_validos(p_autos jsonb)
returns boolean
language sql immutable set search_path = ''
as $$
  select jsonb_typeof(p_autos) = 'array'
     and jsonb_array_length(p_autos) <= 300
     and octet_length(p_autos::text) <= 300000
     and not exists (
       select 1 from jsonb_array_elements(p_autos) e
       where jsonb_typeof(e) <> 'object'
          or coalesce(jsonb_typeof(e->'titulo'), '') <> 'string'
          or length(e->>'titulo') not between 1 and 200
          or exists (select 1 from jsonb_object_keys(e) k
                     where k not in ('clave','titulo','foto','anio','fotoReal','color','serie'))
          or exists (select 1 from jsonb_each(e) c where jsonb_typeof(c.value) <> 'string')
          or length(coalesce(e->>'clave','')) > 400
          or length(coalesce(e->>'color','')) > 60
          or length(coalesce(e->>'serie','')) > 120
          or coalesce(e->>'anio','') !~ '^(\d{4})?$'
          or length(coalesce(e->>'foto','')) > 640
          or length(coalesce(e->>'fotoReal','')) > 640
          or coalesce(e->>'foto','') !~ '^(https://(static\.wikia\.nocookie\.net|upload\.wikimedia\.org|thumb\.wikimedia\.org)/[^\s"<>]+)?$'
          or coalesce(e->>'fotoReal','') !~ '^(https://(static\.wikia\.nocookie\.net|upload\.wikimedia\.org|thumb\.wikimedia\.org)/[^\s"<>]+)?$'
     )
$$;

-- 5. Funciones que usa el servidor con la sesión de la persona. Ninguna recibe el id
--    del garaje propio: siempre se usa el de quien está conectado (auth.uid()).
create or replace function public.mi_garaje()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare u uuid := auth.uid(); g record;
begin
  if not public.sesion_completa() then raise exception 'sesion incompleta' using errcode = '42501'; end if;
  insert into public.garajes (dueno) values (u) on conflict (dueno) do nothing;
  select autos, fondo, actualizado into g from public.garajes where dueno = u;
  return jsonb_build_object('autos', g.autos, 'fondo', g.fondo, 'actualizado', g.actualizado);
end $$;

create or replace function public.guardar_mi_garaje(p_autos jsonb, p_fondo text)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare u uuid := auth.uid(); v timestamptz;
begin
  if not public.sesion_completa() then raise exception 'sesion incompleta' using errcode = '42501'; end if;
  if not public.autos_validos(p_autos) then raise exception 'lista invalida' using errcode = '22023'; end if;
  if p_fondo is null or p_fondo !~ '^(pista|taller|noche|desierto|estudio)$' then p_fondo := 'pista'; end if;
  insert into public.garajes (dueno, autos, fondo) values (u, p_autos, p_fondo)
  on conflict (dueno) do update set autos = excluded.autos, fondo = excluded.fondo, actualizado = now()
  returning actualizado into v;
  return v;
end $$;

-- El link del regalo (?g=...) se puede usar una sola vez: el garaje pasa a la cuenta de
-- quien lo abre conectado. Si esa cuenta ya tenía carros, se juntan: los del regalo primero
-- y sin repetir (los carros viejos sin clave se comparan por título).
create or replace function public.reclamar_garaje(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare u uuid := auth.uid(); regalo record; propio record; juntos jsonb;
begin
  if not public.sesion_completa() then raise exception 'sesion incompleta' using errcode = '42501'; end if;
  select * into regalo from public.garajes where id = p_id for update;
  if not found or (regalo.dueno is not null and regalo.dueno <> u) then
    raise exception 'enlace no valido' using errcode = 'P0002';
  end if;
  if regalo.dueno = u then return jsonb_build_object('reclamado', false); end if;

  select * into propio from public.garajes where dueno = u for update;
  if found then
    select coalesce(jsonb_agg(e order by o), '[]'::jsonb) into juntos from (
      select e, o from (
        select distinct on (coalesce(nullif(e->>'clave', ''), e->>'titulo')) e, o from (
          select e, o from jsonb_array_elements(regalo.autos) with ordinality as a(e, o)
          union all
          select e, o + 100000 from jsonb_array_elements(propio.autos) with ordinality as b(e, o)
        ) todos order by coalesce(nullif(e->>'clave', ''), e->>'titulo'), o
      ) unicos order by o limit 300
    ) lista;
    if octet_length(juntos::text) > 300000 then raise exception 'lista invalida' using errcode = '22023'; end if;
    delete from public.garajes where id = propio.id;
  else
    juntos := regalo.autos;
  end if;

  update public.garajes set dueno = u, autos = juntos, actualizado = now() where id = p_id;
  return jsonb_build_object('reclamado', true);
end $$;

-- 6. Prueba de la autorización de datos (Ley 1581): qué versión de la política aceptó y
--    cuándo. Se anota sola al crearse el usuario, con la versión que el servidor manda en el
--    registro. Al borrar la cuenta solo queda una huella del correo, 3 años.
create table if not exists public.autorizaciones (
  usuario uuid,
  correo_huella text not null,
  version text not null,
  canal text not null default 'formulario de registro web',
  fecha timestamptz not null default now(),
  borrada timestamptz
);
create index if not exists autorizaciones_usuario on public.autorizaciones (usuario);
alter table public.autorizaciones enable row level security;
revoke all on public.autorizaciones from anon, authenticated;

create or replace function public.anotar_autorizacion()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(new.raw_user_meta_data->>'politica_version', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    insert into public.autorizaciones (usuario, correo_huella, version)
    values (new.id, encode(extensions.digest(lower(coalesce(new.email, '')), 'sha256'), 'hex'),
            new.raw_user_meta_data->>'politica_version');
  end if;
  return new;
end $$;
drop trigger if exists garaje_autorizacion on auth.users;
create trigger garaje_autorizacion after insert on auth.users
  for each row execute function public.anotar_autorizacion();
drop function if exists public.anotar_autorizacion(uuid, text);

-- Borrar la cuenta borra su garaje y el usuario (derecho de supresión). De la autorización
-- solo queda la huella del correo, marcada como borrada.
create or replace function public.borrar_mi_cuenta()
returns void
language plpgsql security definer set search_path = ''
as $$
declare u uuid := auth.uid();
begin
  if not public.sesion_completa() then raise exception 'sesion incompleta' using errcode = '42501'; end if;
  update public.autorizaciones set usuario = null, borrada = now() where usuario = u;
  delete from public.garajes where dueno = u;
  delete from auth.users where id = u;
end $$;

-- 7. Límite de intentos (entrar, registrarse, códigos, recuperar contraseña). Solo lo
--    llama el servidor con la clave secreta. Las claves llegan ya seudonimizadas (sin IP
--    ni correo en claro). El candado evita que una ráfaga en paralelo pase de más.
create table if not exists public.intentos (
  clave text not null,
  momento timestamptz not null default now()
);
create index if not exists intentos_clave_momento on public.intentos (clave, momento);
create index if not exists intentos_momento on public.intentos (momento);
alter table public.intentos enable row level security;
revoke all on public.intentos from anon, authenticated;

-- p_anotar = false solo consulta: el servidor anota aparte los intentos fallidos, así quien
-- conoce un correo no puede bloquear la cuenta de su dueño.
drop function if exists public.permitir_intento(text, int, int);
create or replace function public.permitir_intento(p_clave text, p_max int, p_segundos int, p_anotar boolean default true)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare n int;
begin
  if p_clave is null or length(p_clave) > 200 or p_max < 1 or p_segundos < 1 then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_clave, 0));
  select count(*) into n from public.intentos
   where clave = p_clave and momento > now() - make_interval(secs => p_segundos);
  if n >= p_max then return false; end if;
  if p_anotar then insert into public.intentos (clave) values (p_clave); end if;
  return true;
end $$;

-- 8. Limpieza diaria (pg_cron): intentos de más de un día, cuentas que nunca confirmaron
--    el correo después de 7 días (con su autorización: nunca llegaron a ser cuentas) y pruebas
--    de autorización de cuentas borradas hace 3 años. Si una cuenta se borra desde el panel de
--    Supabase, su autorización queda seudonimizada igual que con "borrar mi cuenta".
create or replace function public.limpieza_diaria()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.intentos where momento < now() - interval '1 day';
  delete from public.autorizaciones a using auth.users u
   where a.usuario = u.id and u.email_confirmed_at is null and u.created_at < now() - interval '7 days';
  delete from auth.users where email_confirmed_at is null and created_at < now() - interval '7 days';
  update public.autorizaciones a set usuario = null, borrada = now()
   where a.borrada is null and a.usuario is not null and not exists (select 1 from auth.users u where u.id = a.usuario);
  delete from public.autorizaciones where borrada < now() - interval '3 years';
end $$;
revoke all on function public.limpieza_diaria() from public, anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('garaje-limpieza', '17 9 * * *', 'select public.limpieza_diaria();');
  else
    raise notice 'pg_cron no está disponible: la limpieza diaria queda sin programar';
  end if;
end $$;

-- 9. Permisos. Supabase da permiso de ejecutar a anon, authenticated y service_role por
--    separado, así que se quita a todos y se da solo a quien le toca.
revoke all on function public.sesion_completa() from public, anon, authenticated;
revoke all on function public.autos_validos(jsonb) from public, anon, authenticated;
revoke all on function public.mi_garaje() from public, anon, authenticated;
revoke all on function public.guardar_mi_garaje(jsonb, text) from public, anon, authenticated;
revoke all on function public.reclamar_garaje(uuid) from public, anon, authenticated;
revoke all on function public.borrar_mi_cuenta() from public, anon, authenticated;
revoke all on function public.anotar_autorizacion() from public, anon, authenticated;
revoke all on function public.permitir_intento(text, int, int, boolean) from public, anon, authenticated;

grant execute on function public.mi_garaje() to authenticated;
grant execute on function public.guardar_mi_garaje(jsonb, text) to authenticated;
grant execute on function public.reclamar_garaje(uuid) to authenticated;
grant execute on function public.borrar_mi_cuenta() to authenticated;
grant execute on function public.permitir_intento(text, int, int, boolean) to service_role;

-- 10. Lo que se cree en el futuro en public nace cerrado: Supabase les da permisos a anon y
--     authenticated por defecto en cada tabla, secuencia o función nueva. (A las funciones
--     también las puede ejecutar PUBLIC: por eso cada función nueva lleva su revoke, como arriba.)
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- Revisiones útiles después de correrlo:
-- select routine_name, grantee from information_schema.routine_privileges where routine_schema = 'public' order by 1, 2;
-- select public.autos_validos(autos), jsonb_array_length(autos) from public.garajes where dueno is null;
-- select has_table_privilege('postgres', 'auth.users', 'DELETE'), has_table_privilege('postgres', 'auth.sessions', 'SELECT');
