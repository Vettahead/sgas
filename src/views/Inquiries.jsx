import { useEffect, useMemo, useRef, useState } from 'react'
import {
  listInquiries, createInquiry, updateInquiry, setInquiryStatus, listClientCourses,
  listInquiryMessages, listInquiryLastMessages, postInquiryMessage, listMentionPeople,
  listMyMentions, markInquiryMentionsSeen, searchDelegates, INQUIRY_CLOSE_REASONS,
} from '../lib/api.js'
import { useData } from '../lib/hooks.js'
import { fmt } from '../lib/util.js'
import { toast } from '../lib/toast.js'

/* ---------------------------------------------------------------------------
   Enquiries — a ticket, not a form.

   Jen answers the phone; Simon knows the dates. The old screen had one notes
   box that only ever held the first thing typed, so an enquiry that needed
   Simon's answer went nowhere. Now an enquiry is picked from the list on the
   right and worked on the left: edit the details as more arrives, post
   messages to the thread, @mention whoever has to pick it up, convert it to a
   booking, or close it with a reason. The form is only blank when you first
   arrive or press New.
   ------------------------------------------------------------------------- */

const EMPTY = { name: '', email: '', mobile: '', prefFrom: '', prefTo: '', first: '' }

// Rough "how long ago" for the list.
const ago = (iso) => {
  if (!iso) return ''
  const mins = Math.round((Date.now() - new Date(iso)) / 60000)
  if (mins < 60) return `${Math.max(mins, 0)}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')
const reasonLabel = (k) => INQUIRY_CLOSE_REASONS.find((r) => r.k === k)?.label || ''

// Who is named in a message: every person whose "@Name" appears in it.
function mentionsIn(text, people) {
  const t = String(text || '')
  return (people || []).filter((p) => t.includes('@' + p.name)).map((p) => p.userId)
}

// Render a message body with each @Name picked out.
function Body({ text, people }) {
  const names = (people || []).map((p) => p.name).filter(Boolean).sort((a, b) => b.length - a.length)
  if (!names.length) return <>{text}</>
  const re = new RegExp('(@(?:' + names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + '))', 'g')
  return <>{String(text).split(re).map((part, i) => (part.startsWith('@') && names.includes(part.slice(1)) ? <b key={i} className="inq-at">{part}</b> : <span key={i}>{part}</span>))}</>
}

export default function Inquiries({ go, user, onMentionsSeen }) {
  const { data: inquiries, loading, reload } = useData(listInquiries)
  const { data: lastMsgs, reload: reloadLast } = useData(listInquiryLastMessages)
  const { data: courses } = useData(listClientCourses)
  const { data: people } = useData(listMentionPeople)
  const { data: myMentions, reload: reloadMine } = useData(() => listMyMentions(user))

  const [tab, setTab] = useState('open')
  const [editing, setEditing] = useState(null) // the enquiry on the left, or null = logging a new one
  const [f, setF] = useState(EMPTY)
  const [picked, setPicked] = useState(() => new Set())
  const [msgs, setMsgs] = useState([])
  const [draft, setDraft] = useState('')
  const [closing, setClosing] = useState(false)
  const [closeReason, setCloseReason] = useState('')
  const [closeNote, setCloseNote] = useState('')
  const [matches, setMatches] = useState([]) // delegates already on file with this name
  const [busy, setBusy] = useState(false)
  const taRef = useRef(null)
  const threadRef = useRef(null)

  const mentionedInqs = useMemo(() => new Set((myMentions || []).map((m) => m.inquiryId)), [myMentions])

  const byStatus = useMemo(() => {
    const g = { open: [], converted: [], closed: [] }
    for (const q of inquiries || []) (g[q.status] || g.open).push(q)
    return g
  }, [inquiries])

  // The year-end figure Chris asked for: how many came in, how many turned
  // into bookings, how many were lost and why.
  const yearStats = useMemo(() => {
    const y = new Date().getFullYear()
    const all = (inquiries || []).filter((q) => new Date(q.createdAt).getFullYear() === y)
    const conv = all.filter((q) => q.status === 'converted').length
    const closed = all.filter((q) => q.status === 'closed')
    const reasons = {}
    for (const q of closed) reasons[q.closeReason || 'other'] = (reasons[q.closeReason || 'other'] || 0) + 1
    return { total: all.length, conv, closed: closed.length, reasons }
  }, [inquiries])

  function toggleCourse(name) {
    setPicked((p) => { const n = new Set(p); n.has(name) ? n.delete(name) : n.add(name); return n })
  }

  // ── pick one from the list ────────────────────────────────────────────────
  async function openInq(q) {
    setEditing(q)
    setF({ name: q.name || '', email: q.email || '', mobile: q.mobile || '', prefFrom: q.prefFrom || '', prefTo: q.prefTo || '', first: '' })
    setPicked(new Set((q.courses || '').split(',').map((s) => s.trim()).filter(Boolean)))
    setClosing(false); setCloseReason(''); setCloseNote(''); setDraft(''); setMatches([])
    setMsgs(await listInquiryMessages(q.inquiryId))
    // Opening it is reading it: any @mention of me on this thread is now seen.
    if (mentionedInqs.has(q.inquiryId)) {
      await markInquiryMentionsSeen(q.inquiryId, user)
      reloadMine(); onMentionsSeen?.()
    }
    // Is this person already a delegate? Only worth asking with a full name.
    const words = (q.name || '').trim().split(/\s+/)
    if (words.length >= 2) {
      try { const r = await searchDelegates(q.name, { limit: 5 }); setMatches(r?.rows || []) } catch { setMatches([]) }
    }
  }
  function startNew() {
    setEditing(null); setF(EMPTY); setPicked(new Set()); setMsgs([]); setDraft('')
    setClosing(false); setCloseReason(''); setCloseNote(''); setMatches([])
  }
  useEffect(() => { threadRef.current?.scrollTo?.(0, threadRef.current.scrollHeight) }, [msgs])

  // ── save (new or edited) ──────────────────────────────────────────────────
  async function save() {
    if (!f.name.trim()) return toast('Add a name (first name is fine)')
    if (!f.email.trim() && !f.mobile.trim()) return toast('Add an email or a mobile so we can follow up')
    const d = { name: f.name.trim(), email: f.email.trim(), mobile: f.mobile.trim(), courses: [...picked].join(', '), prefFrom: f.prefFrom || null, prefTo: f.prefTo || null }
    setBusy(true)
    try {
      if (editing) {
        const row = await updateInquiry(editing.inquiryId, d)
        setEditing(row)
        toast(`Saved: ${row.name}`)
      } else {
        const row = await createInquiry(d)
        if (f.first.trim()) await postInquiryMessage(row.inquiryId, f.first.trim(), mentionsIn(f.first, people), user)
        toast(`Enquiry logged: ${row.name}`)
        startNew()
        reloadLast()
      }
      reload()
    } catch (e) { toast(e.message) } finally { setBusy(false) }
  }

  // ── the thread ────────────────────────────────────────────────────────────
  async function post() {
    const body = draft.trim()
    if (!body || !editing) return
    setBusy(true)
    try {
      const m = await postInquiryMessage(editing.inquiryId, body, mentionsIn(body, people), user)
      setMsgs((xs) => [...xs, m]); setDraft(''); reloadLast()
    } catch (e) { toast(e.message) } finally { setBusy(false) }
  }

  // @-picker: the word being typed after an @ at the caret, and who matches it.
  const [caret, setCaret] = useState(0)
  const atWord = useMemo(() => {
    const before = draft.slice(0, caret)
    const m = before.match(/(?:^|\s)@([A-Za-z]*)$/)
    return m ? m[1] : null
  }, [draft, caret])
  const atMatches = useMemo(() => {
    if (atWord == null) return []
    const s = atWord.toLowerCase()
    return (people || []).filter((p) => p.userId !== user?.user_id && p.name.toLowerCase().includes(s)).slice(0, 6)
  }, [atWord, people, user])
  // Put "@Full Name " into the draft: completing the word being typed after an
  // @, or — from the shortcut buttons — inserted at the caret.
  function pickPerson(p) {
    const head = draft.slice(0, caret)
    const before = /@[A-Za-z]*$/.test(head)
      ? head.replace(/@[A-Za-z]*$/, '@' + p.name + ' ')
      : head + (head && !/\s$/.test(head) ? ' ' : '') + '@' + p.name + ' '
    const next = before + draft.slice(caret)
    setDraft(next)
    const pos = before.length
    setCaret(pos)
    requestAnimationFrame(() => { const el = taRef.current; if (el) { el.focus(); el.setSelectionRange(pos, pos) } })
  }

  // ── convert / close / reopen ──────────────────────────────────────────────
  async function convert() {
    if (!editing) return
    const ok = window.confirm(
      `Convert ${editing.name} into a booking?\n\n` +
      'This takes the enquiry off the open list and opens Book a Delegate with the details filled in. ' +
      'If you only wanted to change something, press Cancel and edit it here instead.\n\n' +
      'Changed your mind afterwards? It is on the Converted tab with a Reopen button.'
    )
    if (!ok) return
    await setInquiryStatus(editing.inquiryId, 'converted')
    toast(`Converting ${editing.name} → Book a Delegate`)
    go('book', { name: editing.name, email: editing.email, mobile: editing.mobile, inquiryId: editing.inquiryId })
  }
  async function closeIt() {
    if (!editing) return
    if (!closeReason) return toast('Pick a reason — it is what the year-end numbers are made of')
    await setInquiryStatus(editing.inquiryId, 'closed', { reason: closeReason, note: closeNote.trim() })
    toast(`Enquiry closed: ${editing.name}`)
    startNew(); reload()
  }
  async function reopen(q) {
    await setInquiryStatus(q.inquiryId, 'open')
    toast(`Reopened: ${q.name}`)
    reload(); setTab('open'); openInq({ ...q, status: 'open' })
  }

  const isOpen = !editing || editing.status === 'open'
  const rows = byStatus[tab] || []
  const pct = yearStats.total ? Math.round((yearStats.conv / yearStats.total) * 100) : 0

  return (
    <div className="row c2">
      {/* ── LEFT: the enquiry being worked ─────────────────────────────────── */}
      <div className="card">
        <h3>
          {editing ? <>✎ {editing.name} <span className={'b ' + (editing.status === 'open' ? 'pend' : editing.status === 'converted' ? 'pass' : 'fail')}>{editing.status}</span></> : '① Log an enquiry'}
          <span className="tag">
            {editing ? <button className="btn ghost sm" onClick={startNew} title="Clear the form and log a new enquiry">＋ New</button> : 'quick capture'}
          </span>
        </h3>
        <div className="body">
          {!editing && <div className="hint">Anyone on reception can grab a lead in seconds — a name, a way to reach them, and what they want. Fill in what you have; the rest can wait. Click one in the list to carry on with it later.</div>}

          {matches.length > 0 && (
            <div className="hint">
              Already on file as a delegate:{' '}
              {matches.map((d, i) => (
                <span key={d.client_id}>{i > 0 && ', '}<button className="dn-link" onClick={() => go('delegates', d.client_id)}>{d.forename} {d.surname}</button> <span className="muted">({d.company})</span></span>
              ))}
              {' '}— if Simon has already booked them, close this as <b>Booked another way</b> rather than converting it again.
            </div>
          )}

          <div className="field">
            <label className="fl">Name</label>
            <input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="First name is fine" autoFocus={!editing} disabled={!isOpen} />
          </div>
          <div className="twocol">
            <div className="field">
              <label className="fl">Email {f.email.trim() && <a className="small" href={'mailto:' + f.email.trim()} title="Email them">✉ email</a>}</label>
              <input type="text" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} disabled={!isOpen} />
            </div>
            <div className="field">
              <label className="fl">Mobile {f.mobile.trim() && <a className="small" href={'tel:' + f.mobile.replace(/\s+/g, '')} title="Ring them">☎ ring</a>}</label>
              <input type="text" value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} disabled={!isOpen} />
            </div>
          </div>
          <div className="small muted" style={{ marginTop: -8, marginBottom: 12 }}>At least one of email / mobile.</div>

          <label className="fl">Courses they're interested in</label>
          <div className="inq-courses">
            {(courses || []).map((c) => (
              <button type="button" key={c.course_id} className={'inq-chip' + (picked.has(c.name) ? ' on' : '')} onClick={() => toggleCourse(c.name)} disabled={!isOpen}>
                {picked.has(c.name) ? '✓ ' : ''}{c.name}
              </button>
            ))}
          </div>

          <div className="twocol">
            <div className="field"><label className="fl">Preferred from (optional)</label><input type="date" value={f.prefFrom} onChange={(e) => setF({ ...f, prefFrom: e.target.value })} disabled={!isOpen} /></div>
            <div className="field"><label className="fl">Preferred to (optional)</label><input type="date" value={f.prefTo} onChange={(e) => setF({ ...f, prefTo: e.target.value })} disabled={!isOpen} /></div>
          </div>

          {!editing && (
            <div className="field">
              <label className="fl">What they said (optional)</label>
              <textarea rows={2} value={f.first} onChange={(e) => setF({ ...f, first: e.target.value })} placeholder="Becomes the first message on the thread — @Simon to hand it to him" />
            </div>
          )}

          {isOpen && (
            <div className="inrow" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn" onClick={save} disabled={busy}>{editing ? 'Save changes' : 'Log enquiry'}</button>
              {editing && <>
                <button className="btn ghost" onClick={convert} disabled={busy} title="Take this off the list and open Book a Delegate pre-filled">→ Convert to booking</button>
                <button className="btn ghost" onClick={() => setClosing((c) => !c)} disabled={busy} title="Close without booking — you will be asked why">Close…</button>
              </>}
            </div>
          )}

          {editing && closing && isOpen && (
            <div className="subform" style={{ marginTop: 14 }}>
              <div className="sfh">Why is this one closing?</div>
              <div className="inq-courses" style={{ margin: '0 0 10px' }}>
                {INQUIRY_CLOSE_REASONS.map((r) => (
                  <button type="button" key={r.k} className={'inq-chip' + (closeReason === r.k ? ' on' : '')} onClick={() => setCloseReason(r.k)}>{closeReason === r.k ? '✓ ' : ''}{r.label}</button>
                ))}
              </div>
              <div className="field">
                <label className="fl">Note (optional)</label>
                <input type="text" value={closeNote} onChange={(e) => setCloseNote(e.target.value)} placeholder="Anything worth knowing if they ring again" />
              </div>
              <div className="inrow">
                <button className="btn" onClick={closeIt} disabled={busy || !closeReason}>Close enquiry</button>
                <button className="btn ghost" onClick={() => setClosing(false)}>Keep it open</button>
              </div>
            </div>
          )}

          {editing && editing.status === 'closed' && (
            <div className="banner">Closed {when(editing.handledAt)} — <b>{reasonLabel(editing.closeReason) || 'no reason given'}</b>{editing.closeNote && <> · {editing.closeNote}</>}. <button className="dn-link" onClick={() => reopen(editing)}>Reopen</button></div>
          )}
          {editing && editing.status === 'converted' && (
            <div className="banner">Converted to a booking {when(editing.handledAt)}. Done by mistake? <button className="dn-link" onClick={() => reopen(editing)}>Send it back to enquiries</button></div>
          )}

          {/* ── the thread ─────────────────────────────────────────────── */}
          {editing && (
            <div className="subform" style={{ marginTop: 18 }}>
              <div className="sfh">Messages <span className="muted" style={{ textTransform: 'none', fontWeight: 500 }}>— type @ and a name to hand it to someone</span></div>
              <div className="inq-thread" ref={threadRef}>
                {msgs.length === 0 && <div className="empty">Nothing on this one yet.</div>}
                {msgs.map((m) => (
                  <div key={m.messageId} className={'inq-msg' + (m.userId != null && m.userId === user?.user_id ? ' mine' : '')}>
                    <div className="inq-meta"><b>{m.author}</b> <span className="muted">{when(m.createdAt)}</span></div>
                    <div className="inq-body"><Body text={m.body} people={people} /></div>
                  </div>
                ))}
              </div>
              <div style={{ position: 'relative' }}>
                <textarea
                  ref={taRef} rows={2} value={draft}
                  placeholder={isOpen ? 'Reply, or @Simon to ask him…' : 'This enquiry is not open — reopen it to carry on'}
                  disabled={!isOpen}
                  onChange={(e) => { setDraft(e.target.value); setCaret(e.target.selectionStart) }}
                  onKeyUp={(e) => setCaret(e.target.selectionStart)}
                  onClick={(e) => setCaret(e.target.selectionStart)}
                  onKeyDown={(e) => {
                    if (atMatches.length && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); pickPerson(atMatches[0]); return }
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); post() }
                  }}
                />
                {atMatches.length > 0 && (
                  <div className="inq-atpick">
                    {atMatches.map((p) => <button type="button" key={p.userId} onClick={() => pickPerson(p)}>@{p.name}</button>)}
                  </div>
                )}
              </div>
              {isOpen && (
                <div className="inrow" style={{ alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  <button className="btn sm" onClick={post} disabled={busy || !draft.trim()}>Post</button>
                  <span className="muted small">Ctrl+Enter posts.</span>
                  <span className="muted small" style={{ marginLeft: 'auto' }}>
                    {(people || []).filter((p) => p.userId !== user?.user_id).slice(0, 4).map((p) => (
                      <button key={p.userId} type="button" className="dn-link" style={{ marginLeft: 8 }} onClick={() => pickPerson(p)}>@{p.name.split(' ')[0]}</button>
                    ))}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: the list ────────────────────────────────────────────────── */}
      <div className="card">
        <h3>② Enquiries <span className="tag">{byStatus.open.length} to follow up</span></h3>
        <div className="body" style={{ paddingBottom: 8 }}>
          <div className="inq-courses" style={{ margin: 0 }}>
            {[['open', 'Open'], ['converted', 'Converted'], ['closed', 'Closed']].map(([k, l]) => (
              <button type="button" key={k} className={'inq-chip' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l} <span className="muted">{byStatus[k].length}</span></button>
            ))}
            {mentionedInqs.size > 0 && <span className="b due" style={{ alignSelf: 'center' }}>@ you: {mentionedInqs.size}</span>}
          </div>
          <div className="banner" style={{ marginTop: 10 }}>
            This year: <b>{yearStats.total}</b> logged · <b>{yearStats.conv}</b> converted ({pct}%) · <b>{yearStats.closed}</b> closed
            {yearStats.closed > 0 && <> — {Object.entries(yearStats.reasons).map(([k, n]) => `${reasonLabel(k) || k} ${n}`).join(', ')}</>}
          </div>
        </div>
        <table>
          <thead><tr><th>Name</th><th>Contact</th><th>{tab === 'open' ? 'Wants / latest' : 'Outcome'}</th>{tab !== 'open' && <th></th>}</tr></thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="empty">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={4} className="empty">{tab === 'open' ? 'No open enquiries — all followed up' : `Nothing ${tab} yet`}</td></tr>}
            {rows.map((q) => {
              const last = lastMsgs?.get?.(q.inquiryId)
              const sel = editing && editing.inquiryId === q.inquiryId
              return (
                <tr key={q.inquiryId} onClick={() => openInq(q)} className={'inq-row' + (sel ? ' sel' : '')} title="Open this enquiry">
                  <td>
                    <b>{q.name}</b> {mentionedInqs.has(q.inquiryId) && <span className="b due">@ you</span>}
                    <div className="muted small">{ago(q.createdAt)}</div>
                  </td>
                  <td className="small">{q.email && <div>{q.email}</div>}{q.mobile && <div>{q.mobile}</div>}{!q.email && !q.mobile && <span className="muted">—</span>}</td>
                  {tab === 'open' ? (
                    <td className="small">
                      {q.courses ? q.courses : <span className="muted">—</span>}
                      {(q.prefFrom || q.prefTo) && <div className="muted">📅 {q.prefFrom ? fmt(q.prefFrom) : '…'} – {q.prefTo ? fmt(q.prefTo) : '…'}</div>}
                      {last && <div className="muted" style={{ marginTop: 2 }}><b>{last.author}:</b> {last.body.length > 90 ? last.body.slice(0, 90) + '…' : last.body}</div>}
                    </td>
                  ) : (
                    <td className="small">
                      {q.status === 'converted' ? <span className="b pass">Converted</span> : <span className="b fail">{reasonLabel(q.closeReason) || 'Closed'}</span>}
                      <div className="muted">{when(q.handledAt)}</div>
                      {q.closeNote && <div className="muted">{q.closeNote}</div>}
                    </td>
                  )}
                  {tab !== 'open' && (
                    <td className="nowrap">
                      <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); reopen(q) }} title="Put it back on the open list">↩ Reopen</button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="banner">Click an enquiry to carry on with it — add the email when it turns up, ask @Simon for dates, <b>Convert</b> it into a booking, or <b>Close</b> it with a reason. Converted and closed ones are kept, and can be reopened.</div>
      </div>
    </div>
  )
}
