# Sage — what it is, and what tying PAID to it would mean

**PARKED.** Chris asked for this to be stored and left for later. Nothing is
built. This exists so the next session does not have to re-establish the basics.

## The one fact that decides the whole approach

**Jen is on Sage Accounting Plus (GB)** — confirmed by Chris, 29 Aug 2026.

That is the **cloud** product, not Sage 50. It matters more than anything else
here:

- **Sage Accounting (cloud)** has a proper hosted REST API — Sage Business Cloud
  Accounting v3.1, OAuth 2.0, `developer.sage.com`. An Edge Function can talk to
  it directly, server to server, exactly like `send-email` talks to SMTP.
- **Sage 50** is desktop software. It would have needed a connector or
  middleware running on a machine in the office, permanently on, and a way to
  reach it from the cloud. That whole class of problem does not apply.

**API access is included on Accounting Plus** — Chris checked, 29 Aug 2026.
That was the one thing that could have made this a purchasing conversation
rather than a build; it is not. So when this is picked up it is an ordinary
OAuth integration, not an infrastructure project and not a plan upgrade.

## What already exists on our side

- `booking.sage_ref` (text) — added 8 Jun 2026 with the payments work, editable
  on the Payments screen, saved on blur. **Nothing generates or validates it**;
  it is a place to type the Sage invoice number by hand.
- PAID is a manual checkbox on the same screen. That is the thing that would
  become automatic.
- `chase_log` records every chase, so a paid-status change already has somewhere
  sensible to land.
- The deferred note from 8 Jun still stands: a Sage hyperlink was left out
  because the invoice numbering scheme was unknown. The API would answer that.

## The question to settle before building anything

Which direction is the truth?

1. **SGAS raises the invoice in Sage** (push) — booking becomes invoice, and
   PAID flows back. Bigger, and it changes how Jen works.
2. **Sage stays where invoices are raised, we only read payment status** (pull) —
   match on `sage_ref`, poll or webhook, flip PAID. Much smaller, changes
   nobody's routine, and is almost certainly the right first step.

(2) is the one to cost first. It is also the one that survives being wrong.

## Open, for Jen or Simon

- ~~Is API access included on Accounting Plus?~~ **Yes** — Chris, 29 Aug 2026.
- Who owns the Sage login that would authorise the connection, and are they
  happy for it to be used that way? Read-only first. **This is now the only
  thing standing between here and a costing.**
- Does an invoice already carry anything that ties back to a booking, or is
  `sage_ref` typed in by hand every time?

## Reference

- API docs: https://developer.sage.com/accounting/apis/sagebusinesscloudaccounting/3.1.0/accounting
- Developer portal: https://developers.sageone.com/
