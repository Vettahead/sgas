# -*- coding: utf-8 -*-
"""
NOT A CLIENT DOCUMENT. This is the script that DRAWS the client document.

Run it and it writes SGAS_Sage_Integration_Proposal.pdf, which is the thing
Chris actually sends. Chris does not run this and has no reason to open it - if
he wants the wording changed, change it here and re-run:

    python3 docs/claude/build_sage_pdf.py

Kept because the layout is hand-positioned. Rewriting the document from scratch
each time would move the diagram, and the diagram is the point.

SGAS — Sage integration proposal, as a fillable PDF for Jen and Simon.

Everything is drawn on a canvas rather than flowed, because the swimlane
diagram is the point of the document and it has to sit exactly where the text
around it expects it. A4, UK.

Nothing in here is invented: the 110-qualifications-with-no-price figure and
the Accounting Plus confirmation both came from checking, and the questions are
the ones whose answers actually change what gets built.
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.lib.utils import ImageReader

W, H = A4
NAVY = HexColor('#0d1b2e')
BLUE = HexColor('#0a5ad6')
SKY = HexColor('#4aa8e0')
INK = HexColor('#1f2937')
MUTED = HexColor('#5b6b80')
LINE = HexColor('#d8dfe8')
PANEL = HexColor('#f4f6f9')
AMBER = HexColor('#b7791f')
AMBERBG = HexColor('#fdf3e0')
GREEN = HexColor('#1a8a4b')

LOGO = '/mnt/user-data/uploads/Sgas project/sgas-app/src/assets/sgas-logo.png'
M = 18 * mm                      # page margin
CW = W - 2 * M                   # content width

c = canvas.Canvas('/root/sage/SGAS_Sage_Integration_Proposal.pdf', pagesize=A4)
c.setTitle('SGAS - Sage Integration Proposal')
c.setAuthor('Specialist Gas Assessment Services')
c.setSubject('Proposed workflow and questions')

form = c.acroForm
page_no = [0]


# ── helpers ──────────────────────────────────────────────────────────────────
def wrap(text, font, size, width):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if stringWidth(t, font, size) <= width:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def para(x, y, text, width=None, size=9.5, font='Helvetica', colour=INK, lead=13.2):
    width = width or CW
    c.setFillColor(colour)
    c.setFont(font, size)
    for ln in wrap(text, font, size, width):
        c.drawString(x, y, ln)
        y -= lead
    return y


def heading(x, y, text, size=13):
    c.setFillColor(NAVY)
    c.setFont('Helvetica-Bold', size)
    c.drawString(x, y, text)
    c.setStrokeColor(SKY)
    c.setLineWidth(2)
    c.line(x, y - 5, x + 26, y - 5)
    return y - 18


def header(subtitle):
    """Navy band, logo, and the running title."""
    page_no[0] += 1
    c.setFillColor(NAVY)
    c.rect(0, H - 30 * mm, W, 30 * mm, stroke=0, fill=1)
    try:
        img = ImageReader(LOGO)
        c.drawImage(img, M, H - 24 * mm, width=34 * mm, height=13.8 * mm,
                    mask='auto', preserveAspectRatio=True, anchor='sw')
    except Exception:
        c.setFillColor(white)
        c.setFont('Helvetica-Bold', 20)
        c.drawString(M, H - 20 * mm, 'SGAS')
    c.setFillColor(white)
    c.setFont('Helvetica-Bold', 12.5)
    c.drawRightString(W - M, H - 15 * mm, 'Sage integration')
    c.setFillColor(HexColor('#93a4bb'))
    c.setFont('Helvetica', 8.6)
    c.drawRightString(W - M, H - 20 * mm, subtitle)
    return H - 40 * mm


def footer():
    c.setStrokeColor(LINE)
    c.setLineWidth(0.6)
    c.line(M, 14 * mm, W - M, 14 * mm)
    c.setFillColor(MUTED)
    c.setFont('Helvetica', 7.6)
    c.drawString(M, 10 * mm, 'Specialist Gas Assessment Services  |  Training system - Sage integration proposal')
    c.drawRightString(W - M, 10 * mm, 'Page %d' % page_no[0])


def panel(x, y, w, h, fill=PANEL, stroke=LINE, r=3):
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(0.8)
    c.roundRect(x, y, w, h, r, stroke=1, fill=1)


def box(x, y, w, h, label, sub=None, fill=white, edge=BLUE, bold=True):
    panel(x, y, w, h, fill=fill, stroke=edge)
    c.setFillColor(NAVY)
    c.setFont('Helvetica-Bold' if bold else 'Helvetica', 8.2)
    lines = wrap(label, 'Helvetica-Bold', 8.2, w - 8)
    ty = y + h - 11 if not sub else y + h - 10
    for ln in lines:
        c.drawCentredString(x + w / 2, ty, ln)
        ty -= 9.6
    if sub:
        c.setFillColor(MUTED)
        c.setFont('Helvetica', 6.9)
        for ln in wrap(sub, 'Helvetica', 6.9, w - 8):
            c.drawCentredString(x + w / 2, ty, ln)
            ty -= 8


def arrow(x1, y1, x2, y2, colour=SKY, dash=None):
    c.setStrokeColor(colour)
    c.setFillColor(colour)
    c.setLineWidth(1.4)
    if dash:
        c.setDash(dash, 2)
    c.line(x1, y1, x2, y2)
    c.setDash()
    # head
    import math
    a = math.atan2(y2 - y1, x2 - x1)
    L = 4.6
    p = c.beginPath()
    p.moveTo(x2, y2)
    p.lineTo(x2 - L * math.cos(a - 0.42), y2 - L * math.sin(a - 0.42))
    p.lineTo(x2 - L * math.cos(a + 0.42), y2 - L * math.sin(a + 0.42))
    p.close()
    c.drawPath(p, stroke=0, fill=1)


# ═════════════════════════════════════════════════════════════════════════════
# PAGE 1 — what this is, and the diagram
# ═════════════════════════════════════════════════════════════════════════════
y = header('Proposed workflow and questions  |  30 August 2026')

c.setFillColor(NAVY)
c.setFont('Helvetica-Bold', 17)
c.drawString(M, y, 'Connecting the training system to Sage')
y -= 20

y = para(M, y, (
    'The training system knows every booking, who is on it and what they are taking. Sage knows what has been paid. '
    'Right now the only thing joining the two up is somebody typing an invoice number into a box and ticking Paid by '
    'hand. Here is what I would like to do about that, and the handful of things I need to ask you first.'
), size=10, lead=14)

y -= 8
panel(M, y - 26, CW, 24, fill=AMBERBG, stroke=AMBER)
c.setFillColor(HexColor('#7a4f10'))
c.setFont('Helvetica-Bold', 9.2)
c.drawString(M + 9, y - 11, 'None of this changes how you raise invoices unless you decide you want it to. Phase 1 is the bit to read.')
y -= 40

y = heading(M, y, 'What I am proposing')

# ── swimlane diagram ────────────────────────────────────────────────────────
LANE_H = 33 * mm
top_y = y - LANE_H - 4
bot_y = top_y - LANE_H - 9 * mm

# lane backgrounds
panel(M, top_y, CW, LANE_H, fill=HexColor('#f7fbff'), stroke=LINE)
panel(M, bot_y, CW, LANE_H, fill=HexColor('#fbf8f2'), stroke=LINE)

# lane labels
c.saveState()
c.setFillColor(BLUE)
c.setFont('Helvetica-Bold', 7.6)
c.translate(M + 7, top_y + LANE_H / 2)
c.rotate(90)
c.drawCentredString(0, 0, 'TRAINING SYSTEM')
c.restoreState()
c.saveState()
c.setFillColor(AMBER)
c.setFont('Helvetica-Bold', 7.6)
c.translate(M + 7, bot_y + LANE_H / 2)
c.rotate(90)
c.drawCentredString(0, 0, 'SAGE')
c.restoreState()

LX = M + 15
LW = CW - 22
BW = (LW - 4 * 6) / 5.0
BH = 15.5 * mm
tby = top_y + (LANE_H - BH) / 2 + 3
bby = bot_y + (LANE_H - BH) / 2

steps = [
    ('1. Enquiry', 'taken by whoever answers'),
    ('2. Booking', 'delegate, company, qualifications'),
    ('3. Dates confirmed', 'the moment it becomes real'),
    ('4. Invoice', 'see Phase 1 and 2'),
    ('5. Paid', 'outstanding clears itself'),
]
xs = []
for i, (lab, sub) in enumerate(steps):
    x = LX + i * (BW + 6)
    xs.append(x)
    fill = white if i < 3 else HexColor('#eef4ff')
    box(x, tby, BW, BH, lab, sub, fill=fill)
    if i:
        arrow(xs[i - 1] + BW, tby + BH / 2, x - 1.5, tby + BH / 2)

# Sage side
box(xs[1], bby, BW, BH, 'Customer record', 'linked once, by hand', fill=white, edge=AMBER)
box(xs[3], bby, BW, BH, 'Invoice raised', 'Phase 2 only', fill=white, edge=AMBER)
box(xs[4], bby, BW, BH, 'Payment recorded', 'as you do today', fill=white, edge=AMBER)
arrow(xs[3] + BW, bby + BH / 2, xs[4] - 1.5, bby + BH / 2, colour=AMBER)

# cross-lane arrows
arrow(xs[1] + BW / 2, tby, xs[1] + BW / 2, bby + BH + 1.5, colour=MUTED, dash=[2, 2])
arrow(xs[3] + BW / 2, tby, xs[3] + BW / 2, bby + BH + 1.5, colour=MUTED, dash=[2, 2])
arrow(xs[4] + BW / 2, bby + BH, xs[4] + BW / 2, tby - 1.5, colour=GREEN)

c.setFillColor(MUTED)
c.setFont('Helvetica-Oblique', 7.4)
midy = (tby + bby + BH) / 2 - 2
c.drawString(xs[1] + BW / 2 + 7, midy, 'matched to a Sage customer, once')
c.setFillColor(GREEN)
c.drawRightString(xs[4] + BW / 2 - 11, midy, 'payment status comes back')

y = bot_y - 14

y = para(M, y, (
    'That green arrow is really the whole point. At the moment someone has to spot a payment in Sage and then '
    'remember to go and tick it off in the training system. I would rather the training system just asked Sage, so '
    'the outstanding list and the chase list keep themselves straight.'
), size=9.5)

y -= 6
y = para(M, y, (
    'Sage stays the only place that decides what is owed. The training system would keep a copy so the screens stay '
    'quick, but it would always say when it last checked. A number on a screen should not be able to pass itself off '
    'as more up to date than it really is.'
), size=9.5, colour=MUTED)

y -= 10
y = heading(M, y, 'Two phases, and why')

y = para(M, y, (
    'Reading from Sage and writing to it are two very different propositions. If the reading half goes wrong, a '
    'screen shows the wrong number for a while. If the writing half goes wrong, it is your actual accounts. So I '
    'would rather keep them apart, and take them in this order.'
), size=9.5)
y -= 10

# phase cards
PH = 50 * mm
cw = (CW - 8) / 2

panel(M, y - PH, cw, PH, fill=HexColor('#f2f9f4'), stroke=GREEN)
c.setFillColor(GREEN)
c.setFont('Helvetica-Bold', 10.5)
c.drawString(M + 10, y - 16, 'PHASE 1 - read only')
c.setFillColor(MUTED)
c.setFont('Helvetica-Bold', 7.6)
c.drawString(M + 10, y - 27, 'CAN START AS SOON AS WE HAVE ACCESS')
yy = y - 40
for t in ['You carry on raising invoices in Sage exactly as now.',
          'The system reads back whether an invoice is paid, part paid or outstanding.',
          'Outstanding and chase lists keep themselves up to date.',
          'Nothing is ever written to Sage, so your accounts cannot be affected.',
          'Keith stops needing a Sage login to check if someone has paid.']:
    for ln in wrap('-  ' + t, 'Helvetica', 8.2, cw - 20):
        c.setFillColor(INK)
        c.setFont('Helvetica', 8.2)
        c.drawString(M + 10, yy, ln)
        yy -= 10.4
    yy -= 1.5

x2 = M + cw + 8
panel(x2, y - PH, cw, PH, fill=HexColor('#f7f9fc'), stroke=BLUE)
c.setFillColor(BLUE)
c.setFont('Helvetica-Bold', 10.5)
c.drawString(x2 + 10, y - 16, 'PHASE 2 - raising invoices')
c.setFillColor(MUTED)
c.setFont('Helvetica-Bold', 7.6)
c.drawString(x2 + 10, y - 27, 'ONLY IF YOU WANT IT, AND ONLY AFTER PRICING')
yy = y - 40
for t in ['A confirmed booking puts a draft invoice into Sage for you to check and release.',
          'Needs a price on every qualification, and those prices lined up with Sage.',
          'Needs VAT, PO numbers and no-shows agreed first.',
          'Nothing would go out without you approving it.',
          'Completely optional. Phase 1 is worth having on its own.']:
    for ln in wrap('-  ' + t, 'Helvetica', 8.2, cw - 20):
        c.setFillColor(INK)
        c.setFont('Helvetica', 8.2)
        c.drawString(x2 + 10, yy, ln)
        yy -= 10.4
    yy -= 1.5

footer()
c.showPage()
y = header('Proposed workflow and questions  |  30 August 2026')

y = heading(M, y, 'What has to be true before Phase 2')
panel(M, y - 30, CW, 28, fill=AMBERBG, stroke=AMBER)
c.setFillColor(HexColor('#7a4f10'))
c.setFont('Helvetica-Bold', 9)
c.drawString(M + 9, y - 12, 'There is one thing holding Phase 2 up, and it is at my end rather than yours.')
c.setFont('Helvetica', 8.4)
c.drawString(M + 9, y - 23, 'Not one of the 110 qualifications has a price against it yet, and nothing can be invoiced until the system knows what to charge.')
y -= 46

y = heading(M, y, 'How I would match your customers')

y = para(M, y, (
    'This is the bit most likely to go wrong, so forgive me for labouring it. Every customer in Sage carries its own '
    'reference. Once a company in the training system has been matched to a customer in Sage, that reference is saved '
    'against them, and after that the two stay joined.'
), size=9.5)
y -= 4
y = para(M, y, (
    'Nothing will be created in your Sage. Where a match is not obvious, the company goes on a short list for '
    'someone at your end to point at the right customer. It is a one-off job, and only for the ones that are '
    'genuinely unclear. Leave a computer to guess and you end up with "EDINA" and "EDINA UK LTD" as two separate '
    'customers, and then your aged debtors report is telling you fibs.'
), size=9.5)


# ═════════════════════════════════════════════════════════════════════════════
# questions, fillable
# ═════════════════════════════════════════════════════════════════════════════
def yesno(name, x, y):
    """Two check boxes with labels, returns nothing."""
    form.checkbox(name=name + '_yes', x=x, y=y - 1, size=11,
                  buttonStyle='check', borderColor=MUTED, fillColor=white,
                  textColor=NAVY, borderWidth=0.8, checked=False)
    c.setFillColor(INK)
    c.setFont('Helvetica', 8.6)
    c.drawString(x + 15, y + 2, 'Yes')
    form.checkbox(name=name + '_no', x=x + 40, y=y - 1, size=11,
                  buttonStyle='check', borderColor=MUTED, fillColor=white,
                  textColor=NAVY, borderWidth=0.8, checked=False)
    c.drawString(x + 55, y + 2, 'No')


QN = [0]


def question(y, text, name, lines=3, note=None, yn=False):
    # Work out how tall this block will be and start a new page rather than
    # letting an answer box straddle the fold — somebody printing this needs
    # the question and the space to answer it on the same sheet.
    need = 12.4 * len(wrap(text, 'Helvetica-Bold', 9.6, CW - 16))
    need += 10.2 * len(wrap(note, 'Helvetica-Oblique', 8.2, CW - 16)) if note else 0
    need += 22 if yn else 0
    need += 15.5 * lines + 16
    if y - need < 24 * mm:
        footer()
        c.showPage()
        y = header('Questions for you  |  please fill in and send back')
        y -= 6
    QN[0] += 1
    c.setFillColor(BLUE)
    c.setFont('Helvetica-Bold', 10)
    c.drawString(M, y, str(QN[0]))
    c.setFillColor(NAVY)
    c.setFont('Helvetica-Bold', 9.6)
    yy = y
    for ln in wrap(text, 'Helvetica-Bold', 9.6, CW - 16):
        c.drawString(M + 14, yy, ln)
        yy -= 12.4
    if note:
        c.setFillColor(MUTED)
        c.setFont('Helvetica-Oblique', 8.2)
        for ln in wrap(note, 'Helvetica-Oblique', 8.2, CW - 16):
            c.drawString(M + 14, yy, ln)
            yy -= 10.2
    yy -= 4
    if yn:
        yesno(name, M + 14, yy - 8)
        yy -= 22
        fh = 15.5 * lines
        form.textfield(name=name + '_notes', x=M + 14, y=yy - fh, width=CW - 14, height=fh,
                       borderColor=LINE, fillColor=HexColor('#fbfcfe'), textColor=INK,
                       borderWidth=0.8, fontSize=9, fieldFlags='multiline')
        yy -= fh + 12
    else:
        fh = 15.5 * lines
        form.textfield(name=name, x=M + 14, y=yy - fh, width=CW - 14, height=fh,
                       borderColor=LINE, fillColor=HexColor('#fbfcfe'), textColor=INK,
                       borderWidth=0.8, fontSize=9, fieldFlags='multiline')
        yy -= fh + 12
    return yy


y -= 12
y = heading(M, y, 'What I need to know')
y = para(M, y, (
    'These are the ones where your answer genuinely changes what gets built. Type straight into this and send it '
    'back, or print it and scribble on it, whichever is easier.'
), size=9.5)
y -= 16

y = question(y, 'Would you like invoices raised for you, or would you rather carry on raising them and just have payment status come back?',
             'q_direction', lines=3,
             note='This is the big one. "Leave me to it" is a perfectly good answer, and that is Phase 1.')

y = question(y, 'When do you invoice today - when the booking is taken, or after the course has run?',
             'q_when', lines=3,
             note='I would rather fit round how you already work than ask you to change it.')

y = question(y, 'Are the courses already set up in Sage as products or services, with prices against them?',
             'q_products', lines=3, yn=True,
             note='If they are, the prices can come from Sage instead of being typed in all over again.')

y = question(y, 'Who is invoiced - the delegate, or the company they work for? Is it ever both?',
             'q_payer', lines=3)

y = question(y, 'Do any of your customers require a purchase order number on the invoice?',
             'q_po', lines=3, yn=True,
             note='If so it needs grabbing at the booking, otherwise the invoice comes straight back.')

y = question(y, 'If somebody does not turn up, do you still charge them?',
             'q_noshow', lines=3)

y = question(y, 'Whose Sage login would authorise the connection, and are they happy for it to be used this way?',
             'q_login', lines=3,
             note='Read-only to start with, so there is no way for me to touch a real invoice.')

y = question(y, 'Roughly how many invoices do you raise in a month?',
             'q_volume', lines=1,
             note='Only so I know how often to go and look.')

y = question(y, 'Is there anything about the way you work now that you would not want touched?',
             'q_sacred', lines=5)

y -= 4
panel(M, y - 34, CW, 32, fill=PANEL)
c.setFillColor(NAVY)
c.setFont('Helvetica-Bold', 8.8)
c.drawString(M + 10, y - 13, 'Filled in by')
form.textfield(name='filled_by', x=M + 70, y=y - 19, width=140, height=15,
               borderColor=LINE, fillColor=white, textColor=INK, borderWidth=0.8, fontSize=9)
c.setFont('Helvetica-Bold', 8.8)
c.drawString(M + 225, y - 13, 'Date')
form.textfield(name='filled_date', x=M + 255, y=y - 19, width=90, height=15,
               borderColor=LINE, fillColor=white, textColor=INK, borderWidth=0.8, fontSize=9)

y -= 52
if y < 72 * mm:
    footer(); c.showPage(); y = header('Questions for you  |  please fill in and send back') - 6

y = heading(M, y, 'What happens once this comes back')
STEPS = [
    ('1', 'You send this back', 'Questions 1, 2 and 3 are the ones that shape it. The rest can follow on.'),
    ('2', 'Read-only access', 'One of you signs in to Sage once to allow it. Nothing can be written to your accounts.'),
    ('3', 'I build Phase 1 and show you', 'Payments flowing back, and the outstanding and chase lists looking after themselves.'),
    ('4', 'You decide about Phase 2', 'Once you have lived with Phase 1 for a bit, and only if it is worth the bother.'),
]
for n, t, d in STEPS:
    panel(M, y - 26, CW, 24, fill=PANEL, stroke=LINE)
    c.setFillColor(BLUE)
    c.setFont('Helvetica-Bold', 11)
    c.drawString(M + 11, y - 17, n)
    c.setFillColor(NAVY)
    c.setFont('Helvetica-Bold', 9)
    c.drawString(M + 26, y - 11, t)
    c.setFillColor(MUTED)
    c.setFont('Helvetica', 8)
    c.drawString(M + 26, y - 21, d)
    y -= 30

y -= 4
c.setFillColor(MUTED)
c.setFont('Helvetica-Oblique', 8.4)
c.drawString(M, y, 'If this throws up more questions than it answers, do say. Far easier to change my mind on paper than halfway through building it.')

footer()
c.save()
print('written')
