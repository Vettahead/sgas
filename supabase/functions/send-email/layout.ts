// ─────────────────────────────────────────────────────────────────────────────
// Turning the plain text somebody typed in Admin into an email that looks like
// it came from a business.
//
// THE CONSTRAINT THAT SHAPES ALL OF THIS: the wording is edited by Chris in a
// textarea, in plain English. He must never have to type a tag. So the template
// stays plain text and this file infers the structure from the shape of the
// text — the same shape a person would type anyway:
//
//   Hello Denis,                    → greeting, first paragraph
//   (blank line)                    → new paragraph
//     When:   Mon 14 – Wed 16 Sep   → an indented "label: value" line becomes a
//     Where:  Bay Block A             row in a details table
//   PLEASE BRING PHOTOGRAPHIC ID    → a line in capitals becomes a callout
//   https://…                       → a line that is only a link becomes a button
//   SGAS Training Management        → dropped; the footer already says it
//
// Both versions are sent: the plain text exactly as typed, and this HTML. A
// client that cannot render one shows the other, and the text version is what
// screen readers and search indexes get.
//
// Email HTML is not web HTML. Tables with role="presentation", every style
// inline, 600px, web-safe fonts and no external CSS — Outlook renders through
// Word and Gmail strips <link>.
//
// ONE image, ever: the logo. Mail programs block images by default, so nothing
// an email has to SAY may live in a picture. The logo is allowed because it
// says nothing — blocked, its alt text is styled to render as the same white
// "SGAS" wordmark the header carried before it existed, with the strapline
// underneath as live text either way. Do not add a second image.
// ─────────────────────────────────────────────────────────────────────────────

const BRAND = '#0d1b2e'        // the app's navy
const ACCENT = '#0a5ad6'       // the app's blue
const INK = '#1f2937'
const MUTED = '#5b6b80'
const LINE = '#e3e8ef'
const PAGE = '#f4f6f9'
// Absolute and public — an email is read outside the app, so a bundled asset or
// a relative path is a broken picture. Served from public/email-logo.png, which
// means it only resolves once the site has been deployed. CHANGE THIS if the
// site ever moves to its own domain.
const LOGO = 'https://sgas-opal.vercel.app/email-logo.png'

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

export function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const URL_ONLY = /^https?:\/\/\S+$/i
// "  When:   Mon 14 Sep" — an indented label with a colon. Two spaces of indent
// is what tells us it is a detail line rather than a sentence containing a colon.
const LABEL_LINE = /^\s{2,}([A-Za-z][A-Za-z /'’-]{0,28}):\s+(.*\S)\s*$/
// A paragraph that OPENS in capitals is a warning, and the rest of the
// paragraph belongs with it: "PLEASE BRING PHOTOGRAPHIC ID. Without it we
// cannot assess you and the day is wasted." Deliberately needs a few words —
// "ACS" on its own is a qualification, not a shout.
const SHOUTS = /^[A-Z][A-Z0-9 ,'’()\/-]{7,}(?=[.!:]|$)/

type Block =
  | { t: 'p'; lines: string[] }
  | { t: 'rows'; rows: [string, string][] }
  | { t: 'callout'; lines: string[] }
  | { t: 'button'; href: string }

// Group the text into blocks. Everything downstream just renders these.
export function parseBlocks(text: string): Block[] {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n')
  const out: Block[] = []
  let para: string[] = []
  let rows: [string, string][] = []
  const shout: string[] = []

  const flushPara = () => {
    if (!para.length) return
    out.push({ t: SHOUTS.test(para[0]) ? 'callout' : 'p', lines: para })
    para = []
  }
  // Two detail blocks separated only by a blank line are one table, not two —
  // otherwise the label columns are different widths and nothing lines up.
  const flushRows = () => {
    if (!rows.length) return
    const last = out[out.length - 1]
    if (last && last.t === 'rows') last.rows.push(...rows)
    else out.push({ t: 'rows', rows })
    rows = []
  }
  const flushShout = () => { if (shout.length) { out.push({ t: 'callout', lines: shout }); shout = [] } }
  const flushAll = () => { flushPara(); flushRows(); flushShout() }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')

    if (!line.trim()) { flushAll(); continue }

    // The sign-off is the footer's job.
    if (/^SGAS Training Management\s*$/i.test(line.trim())) { flushAll(); continue }

    const label = line.match(LABEL_LINE)
    if (label) { flushPara(); flushShout(); rows.push([label[1], label[2]]); continue }

    if (URL_ONLY.test(line.trim())) { flushAll(); out.push({ t: 'button', href: line.trim() }); continue }

    flushRows(); flushShout()
    para.push(line.trim())
  }
  flushAll()
  return out
}

// Linkify bare URLs inside a paragraph, after escaping.
function withLinks(escaped: string): string {
  return escaped.replace(/(https?:\/\/[^\s<]+)/g, (u) =>
    `<a href="${u}" style="color:${ACCENT};text-decoration:underline;">${u}</a>`)
}

function renderBlocks(blocks: Block[]): string {
  return blocks.map((b) => {
    if (b.t === 'p') {
      return `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.5;color:${INK};">`
        + withLinks(b.lines.map(esc).join('<br />')) + '</p>'
    }
    if (b.t === 'rows') {
      const rows = b.rows.map(([k, v]) => `
              <tr>
                <td style="padding:6px 16px 6px 0;font-family:${FONT};font-size:14px;line-height:1.4;color:${MUTED};white-space:nowrap;vertical-align:top;">${esc(k)}</td>
                <td style="padding:6px 0;font-family:${FONT};font-size:16px;line-height:1.4;color:${INK};font-weight:600;">${esc(v)}</td>
              </tr>`).join('')
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;background:#f7f9fc;border:1px solid ${LINE};border-radius:8px;">
          <tr><td style="padding:10px 18px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">${rows}
            </table>
          </td></tr>
        </table>`
    }
    if (b.t === 'callout') {
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">
          <tr><td style="padding:12px 16px;background:#fdf3e0;border-left:4px solid #b7791f;border-radius:4px;font-family:${FONT};font-size:15px;line-height:1.5;color:#7a4f10;">`
        + b.lines.map(esc).join('<br />') + '</td></tr></table>'
    }
    // button
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
        <tr><td align="center" bgcolor="${ACCENT}" style="border-radius:6px;">
          <a href="${b.href}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;line-height:1.2;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">Open the link</a>
        </td></tr>
      </table>`
  }).join('\n')
}

// The first real sentence, for the line clients show next to the subject.
export function preheader(text: string): string {
  const line = String(text ?? '').split('\n')
    .map((l) => l.trim())
    .find((l) => l && !/^hello\b/i.test(l) && !/^SGAS Training Management$/i.test(l))
  return (line || '').slice(0, 90)
}

export function toHtml(text: string, subject: string): string {
  const body = renderBlocks(parseBlocks(text))
  const pre = esc(preheader(text))
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${esc(subject)}</title>
<style>
  @media (max-width:600px){
    .sg-wrap{width:100%!important}
    .sg-pad{padding:22px 18px!important}
  }
  @media (prefers-color-scheme:dark){
    .sg-page{background:#0f1620!important}
    .sg-card{background:#161f2b!important;border-color:#26313f!important}
    .sg-ink,.sg-ink p,.sg-ink td{color:#e6ebf2!important}
    .sg-foot,.sg-foot a{color:#8fa0b5!important}
  }
</style>
</head>
<body class="sg-page" style="margin:0;padding:0;background:${PAGE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${pre}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAGE};">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" class="sg-wrap" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;margin:0 auto;">

      <tr><td style="padding:0 0 14px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BRAND};border-radius:10px;">
          <tr><td style="padding:18px 24px;font-family:${FONT};">
            <img src="${LOGO}" width="118" alt="SGAS" style="display:block;border:0;outline:none;text-decoration:none;width:118px;height:auto;font-family:${FONT};font-size:20px;font-weight:700;color:#ffffff;letter-spacing:.5px;" />
            <div style="margin-top:8px;font-size:12px;color:#93a4bb;letter-spacing:.4px;text-transform:uppercase;">Specialist Gas Assessment Services</div>
          </td></tr>
        </table>
      </td></tr>

      <tr><td class="sg-card" style="background:#ffffff;border:1px solid ${LINE};border-radius:10px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td class="sg-pad sg-ink" style="padding:28px 30px 10px;">
${body}
          </td></tr>
        </table>
      </td></tr>

      <tr><td class="sg-foot" style="padding:16px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};">
        Specialist Gas Assessment Services · sent by the SGAS training system<br />
        If anything here looks wrong, reply to this email or ring the office.
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`
}
