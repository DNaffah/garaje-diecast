-- Lo mínimo del esquema auth de Supabase para probar docs/supabase-cuentas.sql en un
-- PostgreSQL local: roles, auth.users, auth.sessions, auth.mfa_factors, auth.uid() y auth.jwt().
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create schema extensions;
create extension pgcrypto with schema extensions;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  email_confirmed_at timestamptz,
  created_at timestamptz default now()
);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, status text);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
grant usage on schema public, auth, extensions to anon, authenticated, service_role;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated, service_role;

-- El esquema viejo, como quedó en producción: tabla de garajes y el garaje del regalo
-- guardado por la versión anterior (carros sin "clave").
create table public.garajes (
  id uuid primary key default gen_random_uuid(),
  autos jsonb not null default '[]'::jsonb,
  fondo text not null default 'pista',
  actualizado timestamptz not null default now()
);
alter table public.garajes enable row level security;
revoke all on public.garajes from anon, authenticated;
insert into public.garajes (id, autos) values ('11111111-1111-4111-8111-111111111111',
  '[{"titulo":"Twin Mill","foto":"","anio":"1969"},{"titulo":"Bone Shaker","foto":""}]');

-- Igual que Supabase: lo que se crea en public nace con permisos para anon y authenticated.
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated;
