-- Garaje 1:64 · segunda pasada de seguridad. Pegar en Supabase → SQL Editor → Run (una sola vez).
-- La función de guardar ahora revisa cada campo: solo fotos de la Hot Wheels Wiki o de Wikimedia,
-- años de 4 cifras y textos con largo máximo. Así nadie con el link puede meter enlaces raros.

create or replace function public.guardar_garaje(p_id uuid, p_autos jsonb, p_fondo text)
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare v timestamptz;
begin
  if jsonb_typeof(p_autos) <> 'array' or jsonb_array_length(p_autos) > 300
     or octet_length(p_autos::text) > 300000 then
    raise exception 'lista inválida';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_autos) e
    where jsonb_typeof(e) <> 'object'
       or jsonb_typeof(e->'titulo') <> 'string' or length(e->>'titulo') > 200
       or exists (select 1 from jsonb_object_keys(e) k
                  where k not in ('clave','titulo','foto','anio','fotoReal','color','serie'))
       or length(coalesce(e->>'clave','')) > 400
       or length(coalesce(e->>'color','')) > 60
       or length(coalesce(e->>'serie','')) > 120
       or coalesce(e->>'anio','') !~ '^(\d{4})?$'
       or coalesce(e->>'foto','') !~ '^(https://(static\.wikia\.nocookie\.net|upload\.wikimedia\.org|thumb\.wikimedia\.org)/[^\s"<>]{1,600})?$'
       or coalesce(e->>'fotoReal','') !~ '^(https://(static\.wikia\.nocookie\.net|upload\.wikimedia\.org|thumb\.wikimedia\.org)/[^\s"<>]{1,600})?$'
  ) then
    raise exception 'auto inválido';
  end if;
  if p_fondo is null or p_fondo !~ '^(pista|taller|noche|desierto|estudio)$' then
    p_fondo := 'pista';
  end if;
  update public.garajes set autos = p_autos, fondo = p_fondo, actualizado = now()
   where id = p_id returning actualizado into v;
  if v is null then raise exception 'garaje no existe'; end if;
  return v;
end $$;

revoke all on function public.guardar_garaje(uuid, jsonb, text) from public;
grant execute on function public.guardar_garaje(uuid, jsonb, text) to anon;
