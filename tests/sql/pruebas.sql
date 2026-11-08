-- Pruebas de docs/supabase-cuentas.sql contra PostgreSQL real. Cualquier fallo corta con error.
\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Ana@Ejemplo.co', '{"politica_version":"2026-11-02"}', now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'beto@ejemplo.co', '{"politica_version":"2026-11-02"}', now()),
  ('cccccccc-0000-4000-8000-000000000003', 'sin@ejemplo.co', '{}', null);
insert into auth.sessions (id, user_id) values
  ('a5a5a5a5-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('b5b5b5b5-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002');

create function pg_temp.como(sub text, sesion text, aal text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', sub, 'session_id', sesion, 'aal', aal, 'role', 'authenticated')::text, false)
$$;
create function pg_temp.falla(sql text, codigo text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'debía fallar con %: %', codigo, sql;
exception when others then
  if sqlstate <> codigo then raise exception 'esperaba % y salió % (%): %', codigo, sqlstate, sqlerrm, sql; end if;
end $$;
grant execute on all functions in schema pg_temp to authenticated, anon, service_role;

-- La prueba de autorización se anotó sola, con la huella del correo en minúsculas.
do $$ begin
  if (select count(*) from public.autorizaciones) <> 2 then raise exception 'autorizaciones: esperaba 2'; end if;
  if not exists (select 1 from public.autorizaciones where correo_huella = encode(extensions.digest('ana@ejemplo.co', 'sha256'), 'hex')) then
    raise exception 'la huella no usa el correo en minúsculas'; end if;
end $$;

set role authenticated;

-- Ana guarda una lista válida con una URL larga (la regex de Postgres no acepta {1,600}).
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001', 'a5a5a5a5-0000-4000-8000-000000000001', 'aal1');
select public.mi_garaje();
select public.guardar_mi_garaje(jsonb_build_array(jsonb_build_object('clave', 'R34', 'titulo', 'R34',
  'foto', 'https://static.wikia.nocookie.net/hotwheels/images/' || repeat('a', 400) || '.png', 'anio', '2010')), 'noche');
do $$ begin
  if (public.mi_garaje()->>'fondo') <> 'noche' or jsonb_array_length(public.mi_garaje()->'autos') <> 1 then raise exception 'no guardó'; end if;
end $$;

-- Datos que no deben pasar.
select pg_temp.falla($q$ select public.guardar_mi_garaje('[{"titulo":"x","foto":"https://malo.example/a.png"}]', 'pista') $q$, '22023');
select pg_temp.falla($q$ select public.guardar_mi_garaje('[{"titulo":"x","color":{"a":1}}]', 'pista') $q$, '22023');
select pg_temp.falla($q$ select public.guardar_mi_garaje('[{"titulo":"x","script":"<b>"}]', 'pista') $q$, '22023');
select pg_temp.falla($q$ select public.guardar_mi_garaje('[{"titulo":""}]', 'pista') $q$, '22023');
select pg_temp.falla($q$ select public.guardar_mi_garaje('[{}]', 'pista') $q$, '22023');

-- Sesión cerrada (otro session_id) o de otra persona: no entra.
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001', 'b5b5b5b5-0000-4000-8000-000000000002', 'aal1');
select pg_temp.falla('select public.mi_garaje()', '42501');
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001', '', 'aal1');
select pg_temp.falla('select public.mi_garaje()', '42501');

-- Con 2FA activa, una sesión aal1 no alcanza; aal2 sí.
reset role;
insert into auth.mfa_factors (user_id, status) values ('aaaaaaaa-0000-4000-8000-000000000001', 'verified');
set role authenticated;
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001', 'a5a5a5a5-0000-4000-8000-000000000001', 'aal1');
select pg_temp.falla('select public.mi_garaje()', '42501');
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001', 'a5a5a5a5-0000-4000-8000-000000000001', 'aal2');
select public.mi_garaje();

-- Beto tiene carros sin clave y uno repetido con el regalo; al reclamarlo no se pierde ninguno.
select pg_temp.como('bbbbbbbb-0000-4000-8000-000000000002', 'b5b5b5b5-0000-4000-8000-000000000002', 'aal1');
select public.guardar_mi_garaje('[{"titulo":"Twin Mill"},{"titulo":"Deora"},{"titulo":"Rodger Dodger"}]', 'pista');
select public.reclamar_garaje('11111111-1111-4111-8111-111111111111');
do $$ declare l jsonb := public.mi_garaje()->'autos'; begin
  if jsonb_array_length(l) <> 4 then raise exception 'al juntar quedaron % carros, esperaba 4: %', jsonb_array_length(l), l; end if;
  if l->0->>'titulo' <> 'Twin Mill' or l->1->>'titulo' <> 'Bone Shaker' then raise exception 'el regalo no quedó primero: %', l; end if;
end $$;
select public.reclamar_garaje('11111111-1111-4111-8111-111111111111');

-- Ana ya no puede reclamar ese regalo, ni uno que no existe.
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001', 'a5a5a5a5-0000-4000-8000-000000000001', 'aal2');
select pg_temp.falla($q$ select public.reclamar_garaje('11111111-1111-4111-8111-111111111111') $q$, 'P0002');
select pg_temp.falla($q$ select public.reclamar_garaje('22222222-2222-4222-8222-222222222222') $q$, 'P0002');

-- Nadie toca las tablas directo ni llama lo que no le toca.
select pg_temp.falla('select * from public.garajes', '42501');
select pg_temp.falla('select * from public.autorizaciones', '42501');
select pg_temp.falla($q$ select public.permitir_intento('x', 5, 60) $q$, '42501');
reset role;
set role anon;
select pg_temp.falla('select public.mi_garaje()', '42501');
reset role;

-- Límite de intentos (solo service_role).
set role service_role;
do $$ begin
  if not public.permitir_intento('prueba', 2, 60) or not public.permitir_intento('prueba', 2, 60) or public.permitir_intento('prueba', 2, 60) then
    raise exception 'el límite de intentos no corta en el tercero'; end if;
  if not public.permitir_intento('consulta', 1, 60, false) or not public.permitir_intento('consulta', 1, 60, false) then
    raise exception 'consultar sin anotar no debería gastar intentos'; end if;
end $$;
reset role;

-- Ana borra su cuenta: se va el usuario y el garaje; de la autorización queda la huella.
set role authenticated;
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001', 'a5a5a5a5-0000-4000-8000-000000000001', 'aal2');
select public.borrar_mi_cuenta();
reset role;
do $$ begin
  if exists (select 1 from auth.users where id = 'aaaaaaaa-0000-4000-8000-000000000001') then raise exception 'no borró el usuario'; end if;
  if exists (select 1 from public.garajes where dueno = 'aaaaaaaa-0000-4000-8000-000000000001') then raise exception 'no borró el garaje'; end if;
  if (select count(*) from public.autorizaciones where usuario is null and borrada is not null) <> 1 then raise exception 'la prueba de autorización no quedó seudonimizada'; end if;
end $$;

-- Limpieza diaria: la cuenta que nunca confirmó (8 días) se va con su autorización; la que
-- se borró desde el panel queda seudonimizada; anon no puede correr la limpieza.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, created_at) values
  ('dddddddd-0000-4000-8000-000000000004', 'vieja@ejemplo.co', '{"politica_version":"2026-11-02"}', null, now() - interval '8 days'),
  ('eeeeeeee-0000-4000-8000-000000000005', 'panel@ejemplo.co', '{"politica_version":"2026-11-02"}', now(), now());
delete from auth.users where id = 'eeeeeeee-0000-4000-8000-000000000005';
select pg_temp.falla('set local role anon; select public.limpieza_diaria()', '42501');
select public.limpieza_diaria();
do $$ begin
  if exists (select 1 from auth.users where id = 'dddddddd-0000-4000-8000-000000000004') then raise exception 'no borró la cuenta sin confirmar'; end if;
  if exists (select 1 from public.autorizaciones where correo_huella = encode(extensions.digest('vieja@ejemplo.co', 'sha256'), 'hex')) then
    raise exception 'quedó la autorización de una cuenta que nunca se confirmó'; end if;
  if not exists (select 1 from public.autorizaciones where usuario is null and borrada is not null
                  and correo_huella = encode(extensions.digest('panel@ejemplo.co', 'sha256'), 'hex')) then
    raise exception 'la autorización de la cuenta borrada desde el panel no quedó seudonimizada'; end if;
  if exists (select 1 from public.autorizaciones a where a.usuario is not null and not exists (select 1 from auth.users u where u.id = a.usuario)) then
    raise exception 'quedaron autorizaciones huérfanas'; end if;
end $$;

-- Lo nuevo en public nace sin permisos para anon ni authenticated.
create table public.tabla_futura (x int);
create function public.funcion_futura() returns int language sql as 'select 1';
do $$ begin
  if has_table_privilege('anon', 'public.tabla_futura', 'SELECT') or has_table_privilege('authenticated', 'public.tabla_futura', 'INSERT') then
    raise exception 'una tabla nueva nace abierta'; end if;
end $$;
drop table public.tabla_futura;
drop function public.funcion_futura();

select 'OK: SQL probado en PostgreSQL ' || current_setting('server_version') as resultado;
