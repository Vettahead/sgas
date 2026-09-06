-- ── REVIEWING WHAT THE MATCHER WOULD NOT DECIDE ─────────────────────────────
-- Matching leaned towards splitting throughout, because a merged pair of humans
-- is unrecoverable and a duplicate is not. That was the right trade, and it
-- leaves 124 people carrying a question. This is where a person answers them.
--
-- Three shapes of question, three answers, and nothing else:
--   ONE N1, TWO SURNAMES  -> two client records exist. Either one person (a
--                            marriage, a corrected spelling) wanting merging,
--                            or genuinely two and it is already right.
--   ONE N1, TWO BIRTHDAYS -> one client, dates disagree. Pick the true one.
--   NO N1, NO BIRTHDAY    -> matched on a name alone, which is not an identity.
--
-- Nothing expires: an unanswered flag stays, and the record works normally.
create or replace function public.app_import_review(p_admin text, p_admin_pw text)
returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v_out jsonb;
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;

  select coalesce(jsonb_agg(g order by g->>'why', g->>'surname'), '[]'::jsonb) into v_out
  from (
    select jsonb_build_object(
      'person_key', s.person_key,
      'client_id',  min(s.client_id),
      'why',        min(s.needs_review),
      'forename',   min(btrim(s.forename)),
      'surname',    min(btrim(s.surname)),
      'n1',         min(nullif(upper(btrim(s.n1)), '')),
      'records',    count(*),
      -- Every spelling, every birthday, every date they were in. The point is
      -- to SEE the disagreement rather than be told there is one.
      'names', (select jsonb_agg(distinct btrim(x.forename) || ' ' || btrim(x.surname))
                  from stg_access_record x where x.person_key = s.person_key),
      'dobs',  (select jsonb_agg(distinct nullif(btrim(x.dob), ''))
                  from stg_access_record x where x.person_key = s.person_key),
      'seen',  (select jsonb_agg(distinct nullif(btrim(x.assessed_on), '') order by nullif(btrim(x.assessed_on), '') desc)
                  from stg_access_record x where x.person_key = s.person_key),
      -- Who this might be the same as. Offered, never applied.
      'candidates', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'client_id', c2.client_id,
                 'name', coalesce(c2.forename, '') || ' ' || coalesce(c2.surname, ''),
                 'n1', c2.ni_number, 'dob', c2.date_of_birth)), '[]'::jsonb)
          from client c2
         where c2.client_id <> min(s.client_id)
           and ((c2.ni_number is not null and c2.ni_number = min(nullif(upper(btrim(s.n1)), '')))
             or (lower(coalesce(c2.surname, '')) = lower(min(btrim(s.surname)))
                 and c2.date_of_birth is not null
                 and c2.date_of_birth::text = min(nullif(btrim(s.dob), ''))))
         limit 8)
    ) as g
    from stg_access_record s
    where s.needs_review is not null
    group by s.person_key
  ) q;
  return v_out;
end;
$$;

-- The three answers. Each is a real change to real records, so each says what
-- it did rather than returning ok.
create or replace function public.app_import_review_act(
  p_admin text, p_admin_pw text, p_person_key text, p_action text,
  p_into_client_id bigint default null, p_dob text default null
) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v_client bigint; v_moved integer := 0; v_msg text;
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;
  select min(client_id) into v_client from stg_access_record where person_key = p_person_key;
  if v_client is null then raise exception 'Nothing to review under that key'; end if;

  if p_action = 'ok' then
    v_msg := 'Left as it is';

  elsif p_action = 'set_dob' then
    if p_dob is null or btrim(p_dob) = '' then raise exception 'Pick which date of birth is right'; end if;
    update client set date_of_birth = p_dob::date where client_id = v_client;
    v_msg := 'Date of birth set to ' || p_dob;

  elsif p_action = 'merge' then
    if p_into_client_id is null then raise exception 'Say which record to merge into'; end if;
    if p_into_client_id = v_client then raise exception 'That is the same record'; end if;
    -- Bookings move FIRST. A client with bookings hanging off it must never be
    -- deleted, and this order means a failure half way through leaves a
    -- duplicate rather than orphaned assessments.
    update booking set client_id = p_into_client_id where client_id = v_client;
    get diagnostics v_moved = row_count;
    update stg_access_record set client_id = p_into_client_id where person_key = p_person_key;
    delete from client where client_id = v_client;
    v_msg := v_moved || ' assessment' || case when v_moved = 1 then '' else 's' end
             || ' moved across, the duplicate removed';
  else
    raise exception 'Unknown action';
  end if;

  update stg_access_record
     set needs_review = null,
         match_by = coalesce(match_by, '') || ' · reviewed by ' || p_admin
   where person_key = p_person_key;

  return jsonb_build_object('ok', true, 'said', v_msg);
end;
$$;

revoke all on function public.app_import_review(text, text) from public, anon, authenticated;
revoke all on function public.app_import_review_act(text, text, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.app_import_review(text, text) to anon, authenticated;
grant execute on function public.app_import_review_act(text, text, text, text, bigint, text) to anon, authenticated;
