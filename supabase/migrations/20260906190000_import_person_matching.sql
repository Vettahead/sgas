-- ── WHO IS WHO ──────────────────────────────────────────────────────────────
-- 4,674 assessment records belonging to about 3,100 people, and the client
-- table was empty, so this is not "match to an existing delegate" — it is
-- "work out how many people are in here". Getting it wrong is not symmetrical:
--
--   TWO PEOPLE MERGED INTO ONE is unrecoverable. Their tickets, expiry dates
--   and renewal letters are now mixed and nothing in the data says so.
--   ONE PERSON SPLIT IN TWO is a duplicate. Visible, and mergeable any time.
--
-- So every judgement call below leans towards splitting.
--
-- The N1 earns its place as the key: 4,563 of 4,674 records carry one, 4,529
-- are well-formed National Insurance numbers, and only 26 disagree with
-- themselves about the name or the date of birth. Those 26 are two different
-- things wearing the same clothes — typing (PENRITH/PENTITH, FEGUSON/FERGUSON,
-- BUIKE/BUICK, CLARK/CLARKE, "SAFHILL - JONES"/"SAFHILL-JONES") and an N1 typed
-- onto the wrong person (CHRIS TAYLOR and MARK BENNETT under one number with
-- birthdays ten years apart). Edit distance on the surname separates them.
create extension if not exists fuzzystrmatch with schema extensions;

alter table public.stg_access_record
  add column if not exists person_key   text,
  add column if not exists needs_review text,
  add column if not exists booking_id   bigint references public.booking(booking_id) on delete set null;

create index if not exists stg_access_record_person_idx on public.stg_access_record (person_key);

-- The permanent trail back to the Access row a booking was built from. `client`
-- already carries one. Without it, in six months nobody can answer "where did
-- this come from" without guessing on dates.
alter table public.booking add column if not exists legacy_access_id bigint;
comment on column public.booking.legacy_access_id is
  'The Access BlankTable2 row this booking was imported from (stg_access_record.src_row). Null for anything booked in this system.';
create unique index if not exists booking_legacy_idx on public.booking (legacy_access_id) where legacy_access_id is not null;

create or replace function public.app_import_match_people(p_admin text, p_admin_pw text)
returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v_out jsonb;
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;

  with norm as (
    select src_row, nullif(upper(btrim(n1)), '') as n1,
           -- Punctuation and spacing carry no information in a surname here.
           regexp_replace(lower(btrim(coalesce(surname, ''))), '[^a-z]', '', 'g') as sn,
           regexp_replace(lower(btrim(coalesce(forename, ''))), '[^a-z]', '', 'g') as fn,
           nullif(btrim(dob), '') as dob
      from stg_access_record
  ),
  -- The name each N1 is judged against: the one used on the most records, so a
  -- single typo never becomes the yardstick.
  anchor as (
    select n1, sn, row_number() over (partition by n1 order by count(*) desc, length(sn) desc, sn) rn
      from norm where n1 is not null and sn <> '' group by n1, sn
  ),
  anchored as (select n1, sn as anchor_sn from anchor where rn = 1),
  keyed as (
    select n.src_row, n.n1, n.sn, n.fn, n.dob,
           case when n.n1 is null then null
                when n.sn = '' or n.sn = a.anchor_sn then 'n1:' || n.n1
                when levenshtein(n.sn, a.anchor_sn) <= 2
                  or n.sn like a.anchor_sn || '%' or a.anchor_sn like n.sn || '%' then 'n1:' || n.n1
                else 'n1:' || n.n1 || '/' || n.sn end as pk
      from norm n left join anchored a on a.n1 = n.n1
  ),
  -- No N1 at all. If surname and date of birth match somebody who has one, they
  -- are that person; otherwise they stand alone, and on a name with no date of
  -- birth they are flagged, because a name on its own is not an identity.
  adopt as (
    select k.src_row,
           (select k2.pk from keyed k2
             where k2.n1 is not null and k2.sn = k.sn and k2.dob is not null and k2.dob = k.dob limit 1) as adopted
      from keyed k where k.n1 is null
  )
  update stg_access_record s
     set person_key = coalesce(k.pk, a.adopted,
           case when k.dob is not null then 'nd:' || k.sn || '|' || k.dob
                when k.sn <> '' then 'nm:' || k.sn || '|' || k.fn
                else 'row:' || s.src_row end),
         match_by = case when k.pk like 'n1:%/%' then 'n1_surname_split'
                         when k.pk is not null then 'n1'
                         when a.adopted is not null then 'name_dob_adopted'
                         when k.dob is not null then 'name_dob'
                         when k.sn <> '' then 'name_only' else 'unmatchable' end,
         needs_review = case
           when k.pk like 'n1:%/%' then 'One N1 number, two different surnames — same person or two people?'
           when k.n1 is null and k.dob is null and k.sn <> '' then 'No N1 and no date of birth — matched on name alone'
           when k.n1 is null and a.adopted is null then 'No N1 number'
           else null end,
         matched_at = now()
    from keyed k left join adopt a on a.src_row = k.src_row
   where s.src_row = k.src_row;

  -- One N1 holding two birth dates. A transposed day and month is a typist; a
  -- ten-year gap is two people. Flagged either way, never split automatically —
  -- the surname already agreed, and that is the stronger signal.
  update stg_access_record s
     set needs_review = coalesce(s.needs_review || ' · ', '') || 'This N1 carries more than one date of birth'
   where s.person_key in (
     select person_key from stg_access_record
      where person_key like 'n1:%' and nullif(btrim(dob), '') is not null
      group by person_key having count(distinct dob) > 1);

  select jsonb_build_object(
    'records', count(*), 'people', count(distinct person_key),
    'by_match', (select jsonb_object_agg(m, n) from (select match_by m, count(*) n from stg_access_record group by 1) x),
    'needing_review', count(*) filter (where needs_review is not null)
  ) into v_out from stg_access_record;
  return v_out;
end;
$$;

revoke all on function public.app_import_match_people(text, text) from public, anon, authenticated;
grant execute on function public.app_import_match_people(text, text) to anon, authenticated;
