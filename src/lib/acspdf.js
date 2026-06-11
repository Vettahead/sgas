// ACS Application form generator.
// The LCL Awards "Application for Assessment (ACS)" PDF is a FLAT form (no
// fillable AcroForm fields), so we overlay text + ticks onto the authentic
// template at fixed coordinates. This keeps the output identical to the form
// Gas Safe expects. Everything runs client-side via pdf-lib — no backend.
//
// Coordinates are in PDF points with the origin at TOP-left expressed as
// pdfplumber 'top' (distance from the top of the page); yb() converts to
// pdf-lib's bottom-left baseline. They were measured against the real template.

import { PDFDocument, rgb } from 'pdf-lib'
import templateUrl from '../assets/acs_template.pdf?url'

const H = 841.92                     // A4 page height in points
const yb = (top) => H - top - 8      // text baseline for a given 'top'

// assessment code -> [code right-edge x, row top]; tick column sits at x+19
const CODE_POS = {
  CCN1: [137.7, 540.0], CESP1: [506.5, 540.0], COCN1: [258.3, 540.0], CoNGLP1PD: [381.6, 540.0],
  CENWAT: [137.7, 550.8], CMA1: [506.6, 550.8], CoDNCO1: [258.4, 550.8], CoNGLP1LAV: [381.5, 550.8],
  CKR1: [137.7, 561.8], CMA2LS: [506.6, 561.8], CORT1: [258.4, 561.8], CoNGLP1RPH: [381.6, 561.8],
  CIGA1: [258.4, 572.6], CMA3: [506.6, 572.6], CoNGLP1B: [381.5, 572.6], HTR1: [137.8, 572.6],
  CoDNESP1: [506.5, 583.5], CoNGLP1CMC: [381.5, 583.5], DAH1: [137.7, 583.5], ICPN1: [258.4, 583.5],
  CCLP1PD: [381.6, 594.3], CDGA1: [258.4, 594.3], LAU1: [137.8, 594.3],
  CCLP1LAV: [381.5, 605.1], CGFE1: [258.4, 605.1], LEI1: [137.8, 605.1],
  CCLP1RPH: [381.6, 616.0], CCP1: [258.4, 616.0], CKHB1: [137.8, 616.0],
  BMP1: [258.5, 626.8], CCCN1: [506.5, 626.8], CCLP1B: [381.5, 626.8], HWB1: [137.7, 626.8],
  CCLP1MC: [381.7, 637.7], CODC1: [506.3, 637.7], CPA1: [137.8, 637.7], TPCP1: [258.4, 637.7],
  'CCLP1E/P': [381.5, 648.5], COCATA1: [506.5, 648.5], TPCP1A: [258.4, 648.5], WAT1: [137.9, 648.5],
  CCLP1EPC: [381.6, 659.3], CMDDA1: [137.7, 659.3], COMCAT1: [506.5, 659.3],
  COCDN1: [137.6, 670.3], COMCAT2: [506.5, 670.3], HTRLP2: [381.5, 670.3],
  COMCAT3: [506.5, 681.1], CoLPNG1: [137.7, 681.1], HTRLP3: [381.5, 681.1],
  COCNPI1LS: [258.4, 692.0], COMCAT4: [506.5, 692.0], WATLP2: [381.6, 692.0],
  COMCAT5: [506.5, 702.8], ICPN1LS: [258.4, 702.8], MET1: [137.8, 702.8], REFLP2: [381.6, 702.8],
  ICAE1LS: [258.4, 713.7], MET3LS: [137.8, 713.7], WAHLP1: [381.6, 713.7],
  EFJLP1: [381.6, 724.5], MET4: [137.8, 724.5],
  CMET1: [137.8, 735.3], VESLP1: [381.5, 735.3],
  CCLNG1: [258.4, 746.2], CMET2: [137.8, 746.2], VESLP2: [381.5, 746.2],
  CABLP1: [381.5, 757.0], CoCCLNG1: [258.4, 757.0], REGT1: [137.7, 757.0],
  CGLP1: [381.5, 767.9], CLE1: [258.4, 767.9], REGT2: [137.7, 767.9],
}
const DOB_X = [184.6, 212.2, 239.3, 266.7, 294.5, 322.05, 349.5, 377.0]
const NI_X = [182.0, 206.4, 230.5, 254.8, 279.2, 303.55, 328.05, 352.4, 377.2]
// GN8 Guidance Note 8 category cells: number -> [x-centre, top]
const GN8 = {
  1: [59.7, 465.8], 2: [230.7, 465.8], 3: [259.1, 465.8], 4: [287.6, 465.8], 5: [316.1, 465.8],
  7: [344.6, 465.8], 10: [373.1, 465.8], 6: [401.6, 465.8], 8: [430.0, 465.8], 9: [458.5, 465.8],
  11: [487.0, 465.8], 12: [515.6, 465.8], 13: [544.0, 465.8],
}

// Which GN8 category to tick. SIMPLE DEFAULT until SGAS confirm the full rule:
// reassessment -> "1" (renewal), new -> "11" (first time application). The
// exact GN8 number depends on the learner's held certs (see ACS GN8) — swap
// this for the real lookup when the rule is confirmed.
export function gn8For(d) { return d.isReassessment ? '1' : '11' }

function drawTick(page, cx, top) {
  const y = H - top - 9
  page.drawLine({ start: { x: cx - 4, y: y + 4 }, end: { x: cx - 1, y }, thickness: 1.5, color: rgb(0, 0, 0) })
  page.drawLine({ start: { x: cx - 1, y }, end: { x: cx + 5, y: y + 9 }, thickness: 1.5, color: rgb(0, 0, 0) })
}

// Fill one or more delegates into copies of the template, returns combined bytes.
export async function fillAcsForm(templateBytes, delegates) {
  const out = await PDFDocument.create()
  for (const d of delegates) {
    const tpl = await PDFDocument.load(templateBytes)
    const font = await tpl.embedFont('Helvetica')
    const fb = await tpl.embedFont('Helvetica-Bold')
    const [p1, p2] = tpl.getPages()
    const T = (s, x, top, sz = 10, f = font) => { if (s) p1.drawText(String(s), { x, y: yb(top), size: sz, font: f, color: rgb(0, 0, 0) }) }
    const C = (s, cx, top, sz = 11, f = fb) => { if (s) { const w = f.widthOfTextAtSize(String(s), sz); p1.drawText(String(s), { x: cx - w / 2, y: yb(top), size: sz, font: f, color: rgb(0, 0, 0) }) } }

    T((d.surname || '').toUpperCase(), 165, 89)
    T((d.forename || '').toUpperCase(), 165, 105)
    T(d.house, 165, 154); T(d.street, 165, 171); T(d.town, 165, 187); T(d.city, 165, 203)
    T(d.county, 165, 220); T((d.postcode || '').toUpperCase(), 165, 236)
    T(d.telephone, 165, 252); T(d.email, 165, 268)

    const dob = (d.dob || '').replace(/\D/g, '').slice(0, 8);[...dob].forEach((ch, i) => C(ch, DOB_X[i], 125))
    const ni = (d.ni || '').replace(/\s/g, '').toUpperCase().slice(0, 9);[...ni].forEach((ch, i) => C(ch, NI_X[i], 141))

    if (d.redirect && d.redirect.length) {
      d.redirect.forEach((ln, i) => p1.drawText(String(ln), { x: 405, y: yb(370 + i * 11), size: 8, font, color: rgb(0, 0, 0) }))
    }
    const g = gn8For(d); if (GN8[g]) drawTick(p1, GN8[g][0], GN8[g][1])
    for (const code of (d.codes || [])) { const pos = CODE_POS[code]; if (pos) drawTick(p1, pos[0] + 19, pos[1]) }
    if (d.fullname) p2.drawText(String(d.fullname), { x: 158, y: yb(404), size: 10, font, color: rgb(0, 0, 0) })

    const pages = await out.copyPages(tpl, [0, 1]); pages.forEach((pg) => out.addPage(pg))
  }
  return out.save()
}

let _tplCache = null
async function templateBytes() {
  if (!_tplCache) _tplCache = await fetch(templateUrl).then((r) => r.arrayBuffer())
  return _tplCache
}

function safe(s) { return String(s || 'form').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') }
function triggerDownload(bytes, filename, type = 'application/pdf') {
  const blob = new Blob([bytes], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

// One delegate -> single 2-page PDF download.
export async function downloadForm(delegate) {
  const bytes = await fillAcsForm(await templateBytes(), [delegate])
  triggerDownload(bytes, `ACS_${safe(delegate.surname)}_${safe(delegate.forename)}.pdf`)
}

// Many delegates -> ONE combined print-ready PDF.
export async function downloadCombined(delegates, label = 'block') {
  const bytes = await fillAcsForm(await templateBytes(), delegates)
  triggerDownload(bytes, `ACS_forms_${safe(label)}.pdf`)
}

// Many delegates -> a ZIP of one PDF per delegate.
export async function downloadZip(delegates, label = 'block') {
  const { default: JSZip } = await import('jszip')
  const tpl = await templateBytes()
  const zip = new JSZip()
  for (const d of delegates) {
    const bytes = await fillAcsForm(tpl, [d])
    zip.file(`ACS_${safe(d.surname)}_${safe(d.forename)}.pdf`, bytes)
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  triggerDownload(blob, `ACS_forms_${safe(label)}.zip`, 'application/zip')
}
