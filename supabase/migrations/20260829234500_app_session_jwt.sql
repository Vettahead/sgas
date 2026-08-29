-- Applied 29 Aug 2026. See supabase/pending/2026-08-29_anon_lockdown.sql for
-- the migration this one exists to make possible.
-- (Full commented source is the version applied to vyabbdxsatvcmwkuircm;
--  reproduced here so the repo and the database agree.)
create extension if not exists pgjwt with schema extensions;

create or replace function public.app_jwt_secret()
returns text language sql stable security definer set search_path = public, vault
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'sgas_jwt_secret' limit 1; $$;
revoke all on function public.app_jwt_secret() from public, anon, authenticated;

create or replace function public.app_mint_token(
  p_user_id bigint, p_username text, p_role text, p_staff_id bigint, p_minutes int default 720
) returns text language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v_secret text := public.app_jwt_secret();
  v_now bigint := extract(epoch from now())::bigint;
begin
  if v_secret is null or length(v_secret) < 32 then return null; end if;
  return extensions.sign(json_build_object(
    'role','authenticated','aud','authenticated','iss','sgas',
    'sub', md5('sgas-user-' || p_user_id::text)::uuid,
    'iat', v_now, 'exp', v_now + (p_minutes * 60),
    'app_user_id', p_user_id, 'app_username', p_username,
    'app_role', p_role, 'app_staff_id', p_staff_id
  ), v_secret);
end; $$;
revoke all on function public.app_mint_token(bigint, text, text, bigint, int) from public, anon, authenticated;

create or replace function public.app_jwt_role() returns text language sql stable set search_path = public
as $$ select nullif(current_setting('request.jwt.claims', true), '')::json ->> 'app_role'; $$;

create or replace function public.app_jwt_user_id() returns bigint language sql stable set search_path = public
as $$ select nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'app_user_id', '')::bigint; $$;

create or replace function public.app_is_signed_in() returns boolean language sql stable set search_path = public
as $$ select public.app_jwt_user_id() is not null; $$;

grant execute on function public.app_jwt_role() to anon, authenticated;
grant execute on function public.app_jwt_user_id() to anon, authenticated;
grant execute on function public.app_is_signed_in() to anon, authenticated;

drop function if exists public.app_login(text, text);
create function public.app_login(p_username text, p_password text)
returns table (user_id bigint, username text, name text, email text,
               role text, is_active boolean, staff_id bigint, token text)
language plpgsql security definer set search_path = public, extensions
as $$
begin
  return query
  select u.user_id, u.username, u.name, u.email, u.role, u.is_active, u.staff_id,
         public.app_mint_token(u.user_id, u.username, u.role, u.staff_id)
  from app_user u
  where lower(u.username) = lower(btrim(p_username))
    and u.is_active and u.password_hash = crypt(p_password, u.password_hash);
end; $$;
revoke all on function public.app_login(text, text) from public;
grant execute on function public.app_login(text, text) to anon, authenticated;
