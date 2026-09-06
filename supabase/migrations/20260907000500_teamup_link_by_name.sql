-- ─────────────────────────────────────────────────────────────────────────────
-- Reading the delegate's name, and matching the ones with no SGAS number.
--
-- The name was never being extracted at all. `\b` is a BACKSPACE in Postgres
-- regular expressions, not a word boundary — that is `\y` — so the pattern
-- failed on every one of the 6,031 lines and noted_name has been null
-- throughout. The SGAS matching survived it by falling back to the first 60
-- characters of the line; matching by name was simply impossible.
--
-- Rather than reach for `\y`, cut the line at the first thing that is certainly
-- not part of a name — "SGAS", a digit, a bracket, a comma, or a spaced dash —
-- and take the leading one or two capitalised words from what is left. That
-- covers every shape SGAS writes:
--   "Paul Bowes SGAS no. 20633 CCN1, CENWAT"   -> Paul Bowes
--   "Scott Allison - DT Gen - COCNPI1LS, BMP1" -> Scott Allison
--   "Mark McGrann CGFE1 SGAS No 21105 T&A"     -> Mark McGrann
--   "Barnacle SGAS no 20678"                   -> Barnacle, a surname alone
--   "xx - Flexitricity - Biogas"               -> nobody: a held seat
--
-- Then the delegates with no number next to them — about 4,000 lines, and
-- nearly everything before 2025, because writing the number down only became a
-- habit then. 2024 has 447 delegate lines and not one number.
--
--   certain — one person of that name, an assessment within three weeks, and a
--             qualification on the line matching what they actually sat
--   likely  — one person of that name and an assessment within three weeks
--   weak    — the name belongs to more than one person, so it is left for
--             somebody to settle rather than guessed
--
-- Anything already linked by its SGAS number is left alone. An exact key beats
-- a name every time.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.app_teamup_read_notes()
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare v_out jsonb;
begin
  delete from teamup_note_line;

  insert into teamup_note_line (event_id, line_no, line, sgas_no, noted_name, marker, is_seat)
  select event_id, line_no, line, sgas, nm,
         upper((regexp_match(line, '\(\s*([RI])\s*\)'))[1]),
         -- A seat is a place held with nobody in it: no full name at the front
         -- and no SGAS number either. "Edina" four times is four places.
         (sgas is null and (nm is null or nm !~ '\s'))
    from (
      select event_id, line_no, line,
             (regexp_match(line, 'SGAS\s*(?:no|number|on|No)?\s*[:.]?\s*([12][0-9]{4})(?![0-9])', 'i'))[1]::bigint as sgas,
             (regexp_match(
                regexp_replace(line, '(?i)\s*(sgas|[0-9(,|]|[-–—]\s).*$', ''),
                '^\s*([A-Z][a-zA-Z''’-]+(?:\s+[A-Z][a-zA-Z''’-]+)?)'))[1] as nm
        from (
          select e.event_id, l.n as line_no,
                 btrim(regexp_replace(l.txt, '\s+', ' ', 'g')) as line
            from teamup_event e,
                 lateral unnest(string_to_array(
                   regexp_replace(
                     replace(replace(replace(coalesce(e.notes,''),'&amp;','&'),'&nbsp;',' '),'&#39;',''''),
                     '<[^>]+>', E'\n', 'g'), E'\n')) with ordinality as l(txt, n)
           where not e.gone_from_teamup
        ) raw
       where length(btrim(line)) >= 4
    ) x;

  select jsonb_build_object(
    'lines', count(*), 'events', count(distinct event_id),
    'with_a_name',         count(*) filter (where noted_name is not null),
    'with_an_sgas_number', count(*) filter (where sgas_no is not null),
    'seats_with_no_name',  count(*) filter (where is_seat),
    'marked_re_sit',       count(*) filter (where marker = 'R'),
    'marked_initial',      count(*) filter (where marker = 'I')
  ) into v_out from teamup_note_line;
  return v_out;
end;
$$;


create or replace function public.app_teamup_link_by_name()
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare v_out jsonb;
begin
  delete from teamup_event_delegate where matched_by = 'name';

  with src as (
    select l.event_id, l.line, l.noted_name, l.marker, e.start_dt::date d,
           split_part(l.noted_name,' ',1) as fore,
           split_part(l.noted_name,' ',2) as sur,
           array(select distinct upper(w)
                   from unnest(string_to_array(regexp_replace(l.line,'[^A-Za-z0-9]',' ','g'),' ')) w
                  where length(w) between 3 and 12) as words
      from teamup_note_line l
      join teamup_event e on e.event_id = l.event_id
     where not e.gone_from_teamup and e.class_kind = 'course'
       and not l.is_seat and l.noted_name is not null and l.noted_name ~ '\s'
       and l.sgas_no is null
  ),
  cand as (
    select s.*, c.client_id,
           count(*) over (partition by s.event_id, s.line) as people_of_that_name
      from src s
      join client c
        on upper(c.surname) = upper(s.sur)
       and (upper(c.forename) = upper(s.fore) or upper(left(c.forename,1)) = upper(left(s.fore,1)))
  ),
  best as (
    select distinct on (c.event_id, c.line, c.client_id)
           c.*, b.booking_id, r.assessed_on::date ad,
           exists (select 1 from booking_category bc
                     join category ca on ca.category_id = bc.category_id
                    where bc.booking_id = b.booking_id and upper(ca.code) = any(c.words)) as qual_agrees
      from cand c
      join booking b on b.client_id = c.client_id
      join stg_access_record r on r.booking_id = b.booking_id
     where abs(r.assessed_on::date - c.d) <= 21
     order by c.event_id, c.line, c.client_id, abs(r.assessed_on::date - c.d)
  )
  insert into teamup_event_delegate
        (event_id, client_id, noted_name, quals, noted_kind, booking_id,
         confidence, name_shared, matched_by, day_gap)
  select event_id, client_id, left(noted_name,120), '{}'::text[],
         case marker when 'R' then 'reassessment' when 'I' then 'initial' end,
         booking_id,
         case when people_of_that_name > 1 then 'weak'
              when qual_agrees then 'certain'
              else 'likely' end,
         people_of_that_name > 1, 'name', d - ad
    from best
  on conflict do nothing;

  select jsonb_build_object(
    'linked', count(*),
    'name_date_and_qualification',   count(*) filter (where confidence='certain'),
    'name_and_date_only',            count(*) filter (where confidence='likely'),
    'name_belongs_to_more_than_one', count(*) filter (where confidence='weak'),
    'people', count(distinct client_id), 'events', count(distinct event_id)
  ) into v_out from teamup_event_delegate where matched_by='name';
  return v_out;
end;
$$;
