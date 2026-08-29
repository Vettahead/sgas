-- Undo the lockdown. Puts every table back exactly as it was before
-- 2026-08-29_anon_lockdown.sql. Run this if the live site goes dark.
begin;
do $body$
declare t text;
begin
  foreach t in array array[
    'assessor','booking','booking_category','category','chase_log','client',
    'company','course','engagement','engagement_member','holiday','inquiry',
    'mlp','mlp_course','pack','renewal_contact','session','staff_accreditation'
  ] loop
    execute format('drop policy if exists p_signed_in_all on public.%I', t);
    execute format($f$
      create policy p_anon_all on public.%I
        for all to anon, authenticated using (true) with check (true)
    $f$, t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $body$;
alter view public.v_live_qualification set (security_invoker = false);
grant select on public.v_live_qualification to anon, authenticated;
commit;
