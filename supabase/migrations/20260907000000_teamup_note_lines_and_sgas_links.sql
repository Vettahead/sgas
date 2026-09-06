-- ─────────────────────────────────────────────────────────────────────────────
-- The Candidates list, read line by line, and the delegates linked by the SGAS
-- number written next to their name.
--
-- Chris spotted this: "the candidates have their name, and then the courses
-- they are on. They also have the SGAS number in there as well."
--
-- That number turns out to be the SAME number Access keeps, and it is issued
-- per ASSESSMENT rather than per person — Scott Sharples is 15299 in 2020,
-- 16293 in 2021, 20086 in 2025. So it is an exact key to one booking, which is
-- a far better thing to match on than a name. All the fuzzy name matching was
-- the wrong tool for a job that had an exact answer sitting in the text.
--
-- The three shapes SGAS actually writes a delegate in:
--   "Alan McClure SGAS no 20939 CGFE (R) 29th September only"   ← number
--   "Scott Allison - DT Gen - COCNPI1LS, BMP1, CGFE1"           ← name + employer
--   "Edina"  /  "xx - Flexitricity - Biogas ..."                ← a seat, no name
--
-- The last of those is four PLACES held by a company, not four people, and must
-- never be matched to anybody.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.teamup_note_line (
  event_id     text    not null references public.teamup_event(event_id) on delete cascade,
  line_no      int     not null,
  line         text    not null,
  sgas_no      bigint,
  noted_name   text,
  marker       text,               -- R = re-sit, I = initial, as written
  is_seat      boolean not null default false,
  primary key (event_id, line_no)
);
alter table public.teamup_note_line enable row level security;
revoke all on public.teamup_note_line from anon, authenticated;
create index if not exists teamup_note_line_sgas_idx on public.teamup_note_line (sgas_no) where sgas_no is not null;
create index if not exists stg_access_id_number_idx on public.stg_access_record (id_number);

alter table public.teamup_event_delegate
  add column if not exists sgas_no bigint,
  add column if not exists matched_by text,
  add column if not exists day_gap int;

-- The raw line is kept beside what was read out of it. The first version parsed
-- the notes inside the edge function and stored only the conclusion, so when a
-- conclusion was wrong there was nothing to look at.
create or replace function public.app_teamup_read_notes()
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare v_out jsonb;
begin
  delete from teamup_note_line;

  insert into teamup_note_line (event_id, line_no, line, sgas_no, noted_name, marker, is_seat)
  select event_id, line_no, line,
         (regexp_match(line, 'SGAS\s*(?:no|number|on|No)?\s*[:.]?\s*([12][0-9]{4})(?![0-9])', 'i'))[1]::bigint,
         (regexp_match(line, '^\s*([A-Z][a-zA-Z''‘’-]{1,20}(?:\s+[A-Z][a-zA-Z''‘’-]{1,20}){1,2})\b'))[1],
         upper((regexp_match(line, '\(\s*([RI])\s*\)'))[1]),
         (line !~ '^\s*[A-Z][a-zA-Z''‘’-]{1,20}\s+[A-Z][a-zA-Z''‘’-]{1,20}' or line ~* '^\s*x{2,}\b')
    from (
      select e.event_id, l.n as line_no,
             btrim(regexp_replace(l.txt, '\s+', ' ', 'g')) as line
        from teamup_event e,
             lateral unnest(string_to_array(
               regexp_replace(
                 replace(replace(replace(coalesce(e.notes,''),'&amp;','&'),'&nbsp;',' '),'&#39;',''''),
                 '<[^>]+>', E'\n', 'g'), E'\n')) with ordinality as l(txt, n)
       where not e.gone_from_teamup
    ) x
   where length(btrim(line)) >= 4;

  select jsonb_build_object(
    'lines', count(*), 'events', count(distinct event_id),
    'with_an_sgas_number', count(*) filter (where sgas_no is not null),
    'with_a_name_only',    count(*) filter (where sgas_no is null and not is_seat),
    'seats_with_no_name',  count(*) filter (where is_seat),
    'marked_re_sit',       count(*) filter (where marker = 'R'),
    'marked_initial',      count(*) filter (where marker = 'I')
  ) into v_out from teamup_note_line;
  return v_out;
end;
$$;

-- The number alone is not enough. Unchecked it produced two confident links to
-- the wrong person: "Ian Mellor SGAS no 20101" resolved to David Ball, 430 days
-- out, and "Mark Richardson - SGAS no. 20444" to Jack Furness, 43 days out. A
-- number gets mistyped, or a note gets copied forward from an older event and
-- the number never updated. So the surname on the line has to agree with the
-- record the number points at, or the date does. Where the number and the words
-- disagree outright, nothing is linked and somebody looks at it.
create or replace function public.app_teamup_link_by_sgas()
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare v_out jsonb;
begin
  delete from teamup_event_delegate where matched_by = 'sgas number';

  with hit as (
    select distinct on (l.event_id, l.sgas_no)
           l.event_id, l.sgas_no, l.line, l.marker,
           coalesce(l.noted_name, btrim(left(l.line, 60))) as noted_name,
           r.client_id, r.booking_id,
           (e.start_dt::date - r.assessed_on::date) as day_gap,
           -- Compare the record's surname against every word on the line. The
           -- length guard keeps short surnames working: "Wu" against "WU" was
           -- being skipped and thrown out as a mismatch.
           (select min(levenshtein(upper(c.surname), w))
              from unnest(string_to_array(upper(regexp_replace(l.line,'[^A-Za-z ]',' ','g')),' ')) w
             where length(w) >= greatest(2, length(c.surname) - 2)) as surname_distance
      from teamup_note_line l
      join teamup_event e on e.event_id = l.event_id
      join stg_access_record r on r.id_number = l.sgas_no::text
      join client c on c.client_id = r.client_id
     where l.sgas_no is not null and r.client_id is not null
     -- A course runs over several days with the same list pasted on each, so
     -- take the sitting closest to the day in question.
     order by l.event_id, l.sgas_no, abs(e.start_dt::date - r.assessed_on::date)
  )
  insert into teamup_event_delegate
        (event_id, client_id, noted_name, quals, noted_kind, booking_id,
         confidence, name_shared, sgas_no, matched_by, day_gap)
  select event_id, client_id, left(noted_name, 120), '{}'::text[],
         case marker when 'R' then 'reassessment' when 'I' then 'initial' end,
         booking_id,
         case
           when coalesce(surname_distance, 99) <= 2 then 'certain'  -- name and number agree
           when abs(day_gap) <= 7                   then 'likely'   -- no name on the line, but the day fits
           else 'weak' end,                                          -- they disagree: do not trust it
         false, sgas_no, 'sgas number', day_gap
    from hit
  on conflict do nothing;

  select jsonb_build_object(
    'numbers_in_the_notes', (select count(*) from teamup_note_line where sgas_no is not null),
    'linked', count(*),
    'name_and_number_agree', count(*) filter (where confidence='certain'),
    'number_only',           count(*) filter (where confidence='likely'),
    'they_disagree',         count(*) filter (where confidence='weak'),
    'people', count(distinct client_id), 'events', count(distinct event_id),
    'within_3_days', count(*) filter (where abs(day_gap) <= 3),
    'said_re_sit',   count(*) filter (where noted_kind='reassessment'),
    'said_initial',  count(*) filter (where noted_kind='initial')
  ) into v_out from teamup_event_delegate where matched_by='sgas number';
  return v_out;
end;
$$;
