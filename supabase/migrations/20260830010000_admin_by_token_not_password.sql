-- Applied 30 Aug 2026. Retires the second password on the Admin page.
--
-- It existed because there was nothing else to go on: every request arrived as
-- `anon`, so re-typing the admin password was the only way to prove who was
-- asking. Since the lockdown the request carries a signed token naming the
-- user, so the question can be answered properly.
--
-- ALL FOURTEEN admin RPCs funnel through app_is_admin(), so this one function
-- is the whole change.
--
-- The token path DOES NOT TRUST THE CLAIM: it reads app_user by the user id in
-- the token, so an admin who is demoted or switched off loses access on their
-- next click rather than when their token expires. Verified — a non-admin whose
-- token claims app_role ADMIN is refused.
create or replace function public.app_is_admin(p_user text, p_pw text)
returns boolean language sql security definer
set search_path to 'public', 'extensions'
as $function$
  select
    exists (
      select 1 from app_user u
      where u.user_id = public.app_jwt_user_id()
        and u.is_active and u.role = 'ADMIN'
    )
    or
    exists (
      select 1 from app_user
      where lower(username) = lower(p_user)
        and is_active and role = 'ADMIN'
        and password_hash = crypt(p_pw, password_hash)
    );
$function$;

-- For the Edge Function, which runs as the service role and so has no
-- request.jwt.claims of its own. It does receive the browser's token in the
-- Authorization header; this is where that gets checked. Returns a bare
-- boolean, never the claims, so a bad token cannot be used to fish for who
-- exists.
create or replace function public.app_token_is_admin(p_token text)
returns boolean language plpgsql security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_secret text := public.app_jwt_secret();
  v_res record;
  v_uid bigint;
begin
  if v_secret is null or p_token is null or length(p_token) < 20 then return false; end if;
  begin
    select * into v_res from extensions.verify(p_token, v_secret);
  exception when others then
    return false;
  end;
  if not coalesce(v_res.valid, false) then return false; end if;
  if coalesce((v_res.payload ->> 'exp')::bigint, 0) <= extract(epoch from now())::bigint then
    return false;
  end if;
  v_uid := nullif(v_res.payload ->> 'app_user_id', '')::bigint;
  if v_uid is null then return false; end if;
  return exists (
    select 1 from app_user u
    where u.user_id = v_uid and u.is_active and u.role = 'ADMIN'
  );
end;
$$;

revoke all on function public.app_token_is_admin(text) from public, anon, authenticated;
