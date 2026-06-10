// In-memory demo dataset, shaped like the Supabase tables (snake_case columns).
// Lets the whole app run with no database. Mirrors sgas_mockup.html data.
// Mutations update this store so demo mode is fully interactive within a session.

export const store = {
  companies: [
    { company_id: 1, name: 'Fylde Heating Ltd', contact_name: 'Dave Marsh', phone: '01253 110011', email: 'accounts@fyldeheating.co.uk', sage_ref: 'SAGE-001', send_to_employer: true },
    { company_id: 2, name: 'Coastline Plumbing', contact_name: 'Sarah Webb', phone: '01253 220022', email: 'sarah@coastlineplumbing.co.uk', sage_ref: 'SAGE-002', send_to_employer: true },
    { company_id: 3, name: 'J. Hartley (Sole Trader)', contact_name: 'John Hartley', phone: '07700 900123', email: 'john.hartley@gmail.com', sage_ref: 'SAGE-003', send_to_employer: false },
    { company_id: 4, name: 'Northwest Renewables', contact_name: 'Priya Shah', phone: '01253 330033', email: 'priya@nwrenewables.co.uk', sage_ref: 'SAGE-004', send_to_employer: true },
  ],
  clients: [
    { client_id: 1, company_id: 1, ni_number: 'AB123456C', forename: 'Tom', surname: 'Ainsworth', date_of_birth: '1990-04-12', mobile: '07700 900001', telephone: '', email: 'tom.a@example.com' },
    { client_id: 2, company_id: 1, ni_number: 'AB223456C', forename: 'Gary', surname: 'Bell', date_of_birth: '1985-09-30', mobile: '07700 900002', telephone: '', email: 'gary.b@example.com' },
    { client_id: 3, company_id: 2, ni_number: 'AB323456C', forename: 'Hassan', surname: 'Iqbal', date_of_birth: '1992-01-15', mobile: '07700 900003', telephone: '', email: 'hassan.i@example.com' },
    { client_id: 4, company_id: 3, ni_number: 'AB423456C', forename: 'John', surname: 'Hartley', date_of_birth: '1978-07-22', mobile: '07700 900123', telephone: '', email: 'john.hartley@gmail.com' },
    { client_id: 5, company_id: 4, ni_number: 'AB523456C', forename: 'Megan', surname: 'Doyle', date_of_birth: '1995-11-03', mobile: '07700 900005', telephone: '', email: 'megan.d@example.com' },
    { client_id: 6, company_id: 2, ni_number: 'AB623456C', forename: 'Liam', surname: 'Prentice', date_of_birth: '1988-03-19', mobile: '07700 900006', telephone: '', email: 'liam.p@example.com' },
    { client_id: 7, company_id: 1, ni_number: 'AB723456C', forename: 'Owen', surname: 'Pugh', date_of_birth: '1991-06-08', mobile: '07700 900007', telephone: '', email: 'owen.p@example.com' },
    { client_id: 8, company_id: 4, ni_number: 'AB823456C', forename: 'Rhys', surname: 'Evans', date_of_birth: '1993-02-27', mobile: '07700 900008', telephone: '', email: 'rhys.e@example.com' },
  ],
  // The `assessors` array is the shared STAFF list (anyone can be trainer/assessor/verifier).
  assessors: [
    { assessor_id: 1, name: 'S Johnston', assigned_room: 'Bay Block A', email: 's.johnston@sgas.test', teamup_subcalendar: 'sub_sjohnston', is_active: true },
    { assessor_id: 2, name: 'K Rimmer', assigned_room: 'Bay Block B', email: 'k.rimmer@sgas.test', teamup_subcalendar: 'sub_krimmer', is_active: true },
    { assessor_id: 3, name: 'A Calvert', assigned_room: 'Classroom 3', email: 'a.calvert@sgas.test', teamup_subcalendar: 'sub_acalvert', is_active: true },
    { assessor_id: 4, name: 'M Patel', assigned_room: 'Classroom 1', email: 'm.patel@sgas.test', teamup_subcalendar: 'sub_mpatel', is_active: true },
    { assessor_id: 5, name: 'D Okeke', assigned_room: 'Bay Block C', email: 'd.okeke@sgas.test', teamup_subcalendar: 'sub_dokeke', is_active: true },
  ],
  courses: [
    { course_id: 1, name: 'Domestic Gas ACS', scheme: 'ACS Domestic', teamup_designator: 'ACS-DOM' },
    { course_id: 2, name: 'LPG', scheme: 'LPG', teamup_designator: 'LPG' },
    { course_id: 3, name: 'Commercial Gas ACS', scheme: 'ACS Commercial', teamup_designator: 'ACS-COM' },
    { course_id: 4, name: 'Commercial Catering', scheme: 'Catering', teamup_designator: 'CATER' },
    { course_id: 5, name: 'OFTEC Oil', scheme: 'OFTEC', teamup_designator: 'OFTEC' },
    { course_id: 6, name: 'Renewables / Heat Pumps', scheme: 'Renewables', teamup_designator: 'RENEW' },
    { course_id: 7, name: 'Solid Fuel (HETAS)', scheme: 'Solid Fuel', teamup_designator: 'SOLID' },
    { course_id: 8, name: 'Electrical', scheme: 'Electrical', teamup_designator: 'ELEC' },
    { course_id: 9, name: 'F-Gas / Air Con', scheme: 'F-gas', teamup_designator: 'FGAS' },
    { course_id: 10, name: 'Water Regulations', scheme: 'Water', teamup_designator: 'WATER' },
  ],
  categories: [
    c(1, 'CCN1', 'Core Domestic Gas Safety', 'ACS Domestic', 5),
    c(2, 'CENWAT', 'Central Heating & Water Heaters', 'ACS Domestic', 5),
    c(3, 'CKR1', 'Domestic Cookers', 'ACS Domestic', 5),
    c(4, 'HTR1', 'Gas Fires & Wall Heaters', 'ACS Domestic', 5),
    c(5, 'WAT1', 'Instantaneous Water Heaters', 'ACS Domestic', 5),
    c(6, 'DAH1', 'Ducted Air Heaters', 'ACS Domestic', 5),
    c(7, 'MET1', 'Domestic Gas Meters', 'ACS Domestic', 5),
    c(8, 'MET2', 'Medium Pressure Meters', 'ACS Domestic', 5),
    c(9, 'CPA1', 'Combustion Performance Analysis', 'ACS Domestic', 5),
    c(10, 'LAU1', 'Domestic Laundry (Tumble Dryers)', 'ACS Domestic', 5),
    c(11, 'TPCP1', 'Tightness Testing & Purging', 'ACS Domestic', 5),
    c(12, 'CONGLP1', 'LPG Changeover (NG to LPG)', 'LPG', 5),
    c(13, 'HTRLP2', 'LPG Fires & Heaters', 'LPG', 5),
    c(14, 'CKRLP2', 'LPG Cookers', 'LPG', 5),
    c(15, 'WATLP2', 'LPG Water Heaters', 'LPG', 5),
    c(16, 'COCN1', 'Core Commercial Gas Safety', 'ACS Commercial', 5),
    c(17, 'CORT1', 'Commercial Heating & Plant', 'ACS Commercial', 5),
    c(18, 'CIGA1', 'Commercial Industrial Gas Appliances', 'ACS Commercial', 5),
    c(19, 'ICPN1', 'Commercial Pipework', 'ACS Commercial', 5),
    c(20, 'TPCP1A', 'Commercial Tightness Testing & Purging', 'ACS Commercial', 5),
    c(21, 'COMCAT1', 'Commercial Catering — Core', 'Catering', 5),
    c(22, 'COMCAT2', 'Catering — Ovens & Ranges', 'Catering', 5),
    c(23, 'COMCAT3', 'Catering — Boiling & Steaming', 'Catering', 5),
    c(24, 'OFTEC101', 'Oil — Domestic Pressure Jet', 'OFTEC', 5),
    c(25, 'OFTEC105E', 'Oil — Tank Installation & Siting', 'OFTEC', 5),
    c(26, 'OFTEC600A', 'Oil — Vaporising Burners', 'OFTEC', 5),
    c(27, 'HP-ASHP', 'Air Source Heat Pump Install', 'Renewables', 5),
    c(28, 'HP-GSHP', 'Ground Source Heat Pump Install', 'Renewables', 5),
    c(29, 'SOLAR-PV', 'Solar Photovoltaic Install', 'Renewables', 5),
    c(30, 'SOLAR-TH', 'Solar Thermal Hot Water', 'Renewables', 5),
    c(31, 'HETAS-DRY', 'Solid Fuel — Dry Appliances', 'Solid Fuel', 5),
    c(32, 'HETAS-WET', 'Solid Fuel — Wet Systems', 'Solid Fuel', 5),
    c(33, 'C&G2382', '18th Edition Wiring Regs', 'Electrical', null),
    c(34, 'C&G2391', 'Inspection & Testing', 'Electrical', null),
    c(35, 'PARTP', 'Part P Domestic Electrical', 'Electrical', null),
    c(36, 'FGAS-CAT1', 'F-Gas Category 1 (Refrig & AC)', 'F-gas', null),
    c(37, 'FGAS-CAT2', 'F-Gas Category 2', 'F-gas', null),
    c(38, 'WRAS', 'Water Regulations (WRAS)', 'Water', null),
  ],
  // A `session` is a course BLOCK (course + dates). Roles come from the staff list.
  // Blocks 5 & 6 are freshly "pulled from Teamup" — no staff assigned yet.
  sessions: [
    s(1, 1, '2026-06-15', '2026-06-17', 'tu-1', 4, 1, 2),
    s(2, 1, '2026-06-22', '2026-06-26', 'tu-2', 4, 2, 3),
    s(3, 5, '2026-07-01', '2026-07-02', 'tu-3', 4, 1, 2),
    s(4, 6, '2026-07-06', '2026-07-10', 'tu-4', 5, 3, 2),
    s(5, 1, '2026-07-13', '2026-07-15', 'tu-5', null, null, null),
    s(6, 6, '2026-07-20', '2026-07-24', 'tu-6', null, null, null),
  ],
  bookings: [
    bk(1, 1, 1, 1, false, false, false, null),
    bk(2, 2, 1, 1, false, false, true, null),
    bk(3, 3, 2, 2, false, false, false, null),
    bk(4, 4, 3, 3, false, false, false, null),
    bk(5, 5, 4, 4, false, false, false, null),
    bk(6, 6, 2, 2, false, false, false, null),
  ],
  booking_categories: [
    bc(1, 1, 1, 'PASS', '2021-07-01', '2026-07-01'),
    bc(2, 1, 2, 'PASS', '2021-07-01', '2026-07-01'),
    bc(3, 2, 1, 'PASS', '2021-07-16', '2026-07-16'),
    bc(4, 2, 3, 'PENDING', null, null),
    bc(5, 3, 1, 'PENDING', null, null),
    bc(6, 3, 2, 'PENDING', null, null),
    bc(7, 3, 4, 'PENDING', null, null),
    bc(8, 4, 24, 'PASS', '2023-07-01', '2028-07-01'),
    bc(9, 5, 27, 'PENDING', null, null),
    bc(10, 6, 1, 'PASS', '2026-05-20', '2031-05-20'),
    bc(11, 6, 3, 'FAIL', null, null),
    bc(12, 6, 4, 'PENDING', null, null),
  ],
  pool: [
    { id: 101, client_id: 3, scheme: 'ACS Domestic', category_ids: [1, 2, 4] },
    { id: 102, client_id: 6, scheme: 'ACS Domestic', category_ids: [1, 3] },
    { id: 103, client_id: 7, scheme: 'ACS Domestic', category_ids: [1, 2] },
    { id: 104, client_id: 1, scheme: 'ACS Domestic', category_ids: [1], kind: 'REASSESS' },
    { id: 105, client_id: 2, scheme: 'ACS Domestic', category_ids: [1, 2], mlp: true, igas: true },
    { id: 106, client_id: 4, scheme: 'OFTEC', category_ids: [24, 25] },
    { id: 107, client_id: 5, scheme: 'Renewables', category_ids: [27], kind: 'REASSESS' },
    { id: 108, client_id: 8, scheme: 'Renewables', category_ids: [27, 29] },
  ],
  users: [
    { user_id: 1, username: 'admin', name: 'Demo Admin', email: 'admin@sgas.test', role: 'ADMIN', is_active: true,
      password_salt: 'e318c2be7e8a2a2598ac755bae720ed9', password_hash: '5791ef2a85f8848df500f67c6facab5ab082ccb20d1053469117a4cf162ed29b' },
    { user_id: 2, username: 'reception', name: 'Demo Reception', email: 'reception@sgas.test', role: 'STANDARD', is_active: true,
      password_salt: 'c29dc5a8cbffb68c04bea479eed04f38', password_hash: '17e7e58f9ab7263374e79fc976a2dcab16366c58bf5d6f3a478b1468ff9b4210' },
    // All demo accounts share password 'demo' (same salt/hash as reception).
    { user_id: 3, username: 'scheduler', name: 'Demo Scheduler', email: 'scheduler@sgas.test', role: 'SCHEDULER', is_active: true,
      password_salt: 'c29dc5a8cbffb68c04bea479eed04f38', password_hash: '17e7e58f9ab7263374e79fc976a2dcab16366c58bf5d6f3a478b1468ff9b4210' },
    { user_id: 4, username: 'assessor', name: 'Demo Assessor', email: 'assessor@sgas.test', role: 'ASSESSOR', is_active: true,
      password_salt: 'c29dc5a8cbffb68c04bea479eed04f38', password_hash: '17e7e58f9ab7263374e79fc976a2dcab16366c58bf5d6f3a478b1468ff9b4210' },
    { user_id: 5, username: 'accounts', name: 'Demo Accounts', email: 'accounts@sgas.test', role: 'ACCOUNTS', is_active: true,
      password_salt: 'c29dc5a8cbffb68c04bea479eed04f38', password_hash: '17e7e58f9ab7263374e79fc976a2dcab16366c58bf5d6f3a478b1468ff9b4210' },
  ],
  chase_log: [
    { chase_id: 1, booking_id: 2, chased_at: '2026-06-02T09:15:00Z', items: 'Payment', channel: 'email' },
  ],
  // Tom Ainsworth (client 1) is on an MLP of 3 courses; he's passed Domestic (course 1).
  mlps: [
    { mlp_id: 1, client_id: 1, label: 'Gas new-entrant MLP', created_at: '2026-05-01T09:00:00Z', completed_at: null },
  ],
  mlp_courses: [
    { mlp_course_id: 1, mlp_id: 1, course_id: 1 },
    { mlp_course_id: 2, mlp_id: 1, course_id: 5 },
    { mlp_course_id: 3, mlp_id: 1, course_id: 6 },
  ],
  seq: { client: 8, company: 4, session: 6, booking: 6, bcat: 12, pool: 108, user: 5, staff: 5, chase: 1, mlp: 1, mlpc: 3 },
}

export const ASSESSOR_COLOR = { 1: '#0a5ad6', 2: '#1a8a4b', 3: '#9a3fb5', 4: '#b7791f', 5: '#0a7d63' }

function c(id, code, description, scheme, renewal_years) {
  return { category_id: id, code, description, scheme, renewal_years }
}
function s(id, course_id, start_date, end_date, teamup_event_id, trainer_id, assessor_id, verifier_id) {
  return { session_id: id, course_id, start_date, end_date, teamup_event_id, trainer_id, assessor_id, verifier_id }
}
function bk(id, client_id, session_id, company_id, flag_mlp, flag_igas, flag_payment_outstanding, last_chased) {
  return {
    booking_id: id, client_id, session_id, company_id,
    overall_result: 'PENDING', disposition: 'NONE', assess_notes: null,
    flag_mlp, flag_igas, flag_payment_outstanding,
    flag_cert_outstanding: false, flag_photo_outstanding: false, sage_ref: null,
    is_reassessment: false, pref_date_from: null, pref_date_to: null, rescheduled: false,
    igas_evidence_date: null, last_chased, confirmation_sent_at: null,
  }
}
function bc(id, booking_id, category_id, result, achieved_date, expiry_date) {
  return { booking_category_id: id, booking_id, category_id, result, achieved_date, expiry_date }
}
