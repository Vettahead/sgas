#!/usr/bin/env node
/* Class-name audit for a single global stylesheet.
 *
 * WHY THIS EXISTS. Twice now a class name has collided and nothing reported it:
 *   v1.28.1  .cx-ghost — the drag ghost and a popover button shared a name, and
 *            the button became unclickable.
 *   v1.32.3  the popover wrote its placement side on as a BARE class, so `top`
 *            picked up .top — the page header strip — and a panel opening above
 *            its course laid its contents out in a row.
 * Both only appeared in the one state that triggered them. A stylesheet has no
 * modules, so the only defence is knowing what is in it.
 *
 * Three answers:
 *   COLLISION RISK  a class the JSX composes at RUNTIME from a variable with no
 *                   namespace prefix — the exact shape of the v1.32.3 bug.
 *   DEAD            a class defined in CSS that no JSX composes.
 *   UNSTYLED        a class the JSX composes that no CSS defines (usually fine
 *                   — hooks for tests — but a typo looks like this too).
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'

const SRC = process.argv[2] || 'src'
const CSS = process.argv[3] || 'src/styles.css'

const walk = (d, out = []) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (['.jsx', '.js'].includes(extname(p))) out.push(p)
  }
  return out
}

// ── what the stylesheet defines ──────────────────────────────────────────────
const css = readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const defined = new Map()                       // class -> count of rules
for (const m of css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
  defined.set(m[1], (defined.get(m[1]) || 0) + 1)
}

// ── what the JSX composes ────────────────────────────────────────────────────
const files = walk(SRC)
const used = new Set()
const prefixes = new Set()                      // 'cx-side-' from 'cx-side-' + x
const risks = []

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  // Every className= / classList / class string, with its expression.
  for (const m of src.matchAll(/className\s*=\s*(?:"([^"]*)"|\{([\s\S]*?)\}\s*(?=[\s/>]))/g)) {
    const [, plain, expr] = m
    const line = src.slice(0, m.index).split('\n').length
    if (plain != null) { plain.split(/\s+/).filter(Boolean).forEach((c) => used.add(c)); continue }
    if (!expr) continue
    // literals inside the expression
    for (const lit of expr.matchAll(/'([^']*)'|"([^"]*)"|`([^`$]*)`/g)) {
      const text = lit[1] ?? lit[2] ?? lit[3] ?? ''
      const parts = text.split(/\s+/).filter(Boolean)
      // ANY part ending in a separator is a prefix for a computed suffix —
      //   'tip tip-' + place   ->  tip, and tip-* 
      // An earlier version only accepted a single-part literal and therefore
      // reported tip-above/tip-below as dead. A dead-code list you cannot trust
      // is worse than none: it gets you to delete something live.
      for (const part of parts) if (/[-_]$/.test(part)) prefixes.add(part)
      parts.forEach((c) => used.add(c))
    }
    // THE RISK: a bare variable concatenated straight in, with no prefix.
    //   ' ' + pos.side          -> `top`
    //   ${kind}                 -> `warn`
    // versus the safe form, where the literal carries the namespace:
    //   ' cx-side-' + pos.side
    const bare = [
      ...expr.matchAll(/['"`]\s+['"`]\s*\+\s*\(?\s*([A-Za-z_$][\w$.?[\]]*)/g),   // ' ' + x
      // `${x}` only counts when it OPENS the template or follows a space —
      // i.e. it really is a whole class name, not part of a comparison.
      ...expr.matchAll(/`\s*\$\{\s*([A-Za-z_$][\w$.?[\]]*)\s*\}/g),
    ]
    for (const bm of bare) {
      const before = expr.slice(Math.max(0, bm.index - 24), bm.index)
      // Safe if the literal immediately before ends in a namespace separator:
      //   ' cx-side-' + side   ->  cx-side-top
      if (/[\w]-\s*['"`]?\s*$/.test(before)) continue
      // A `className` PROP passed through is the ordinary React idiom — the
      // caller owns the value, and every caller here passes a namespaced one.
      // Flagging it would train people to ignore this list.
      if (/^className$/.test(bm[1])) continue
      // A template literal on the right of a comparison is being COMPARED, not
      // used as a class: `month === \`${jumpY}-...\` ? 'on' : ''`.
      if (/(?:={2,3}|!={1,2})\s*$/.test(before.replace(/`\s*$/, ''))) continue
      risks.push({ file, line, name: bm[1], snippet: expr.replace(/\s+/g, ' ').trim().slice(0, 110) })
    }
  }
  // data-tip etc. can carry class names too; also catch classList.add('x')
  for (const m of src.matchAll(/classList\.(?:add|remove|toggle|contains)\(\s*'([^']+)'/g)) used.add(m[1])
  for (const m of src.matchAll(/closest\(\s*'\.([\w-]+)/g)) used.add(m[1])
  for (const m of src.matchAll(/querySelector(?:All)?\(\s*'([^']+)'/g)) {
    for (const c of m[1].matchAll(/\.([\w-]+)/g)) used.add(c[1])
  }
}

const usedByPrefix = (c) => [...prefixes].some((p) => c.startsWith(p) && c.length > p.length)
const dead = [...defined.keys()].filter((c) => !used.has(c) && !usedByPrefix(c)).sort()
const unstyled = [...used].filter((c) => !defined.has(c)).sort()

const group = (list) => {
  const g = new Map()
  for (const c of list) { const k = c.split('-')[0]; if (!g.has(k)) g.set(k, []); g.get(k).push(c) }
  return [...g.entries()].sort((a, z) => z[1].length - a[1].length)
}

// SELF-TEST. This lint exists to catch one shape; if it ever stops catching it,
// it is worse than useless because it reads as an all-clear.
{
  const bug = "className={'cx-pop' + (sheet ? ' sheet' : '') + (pos ? ' ' + (pos.side || '') : '')} "
  const found = [...bug.matchAll(/['"`]\s+['"`]\s*\+\s*\(?\s*([A-Za-z_$][\w$.?[\]]*)/g)]
    .filter((m) => !/[\w]-\s*['"`]?\s*$/.test(bug.slice(Math.max(0, m.index - 24), m.index)))
    .filter((m) => m[1] !== 'className')
  if (!found.length) {
    console.error('SELF-TEST FAILED: this lint no longer detects the v1.32.3 bug it was written for.')
    process.exit(2)
  }
}

console.log(`${files.length} files · ${defined.size} classes defined in CSS · ${used.size} composed in JSX\n`)
console.log(`── COLLISION RISK: ${risks.length} runtime class name(s) with no namespace ──`)
for (const r of risks) console.log(`  ${r.file}:${r.line}  <${r.name}>\n      ${r.snippet}`)
// ── GENERIC: a BARE rule can reach anything ──────────────────────────────────
// `.top{...}` applies to every element carrying `top`, wherever it came from.
// That is what bit v1.32.3. A prefix-less name styled by a bare rule AND used
// in more than one place is the hazard; scoped rules (`.parent .top`) are fine.
{
  const bareRule = new Set()
  for (const m of css.matchAll(/(^|[},])\s*([^{},]+)\{/g)) {
    for (const sel of m[2].split(',')) {
      const t = sel.trim()
      // A whole selector that is ONE class and nothing else.
      const only = t.match(/^\.(-?[_a-zA-Z][\w-]*)$/)
      if (only) bareRule.add(only[1])
    }
  }
  const owners = new Map()
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/className\s*=\s*(?:"([^"]*)"|\{([\s\S]*?)\}\s*(?=[\s/>]))/g)) {
      const text = (m[1] ?? m[2] ?? '')
      for (const lit of text.matchAll(/'([^']*)'|"([^"]*)"|`([^`$]*)`/g)) {
        for (const c of (lit[1] ?? lit[2] ?? lit[3] ?? '').split(/\s+/).filter(Boolean)) {
          if (!bareRule.has(c) || c.includes('-')) continue
          if (!owners.has(c)) owners.set(c, new Set())
          owners.get(c).add(file)
        }
      }
    }
  }
  const shared = [...owners.entries()].filter(([, f]) => f.size > 1).sort((a, z) => z[1].size - a[1].size)
  console.log(`\n── GENERIC: ${shared.length} prefix-less class(es) with a bare rule, used in 2+ files ──`)
  for (const [c, f] of shared) console.log(`  .${c}  (${f.size} files) ${[...f].map((x) => x.replace(/^src\//, '')).slice(0, 6).join(' ')}`)
}

console.log(`\n── DEAD: ${dead.length} classes defined but never composed ──`)
for (const [k, list] of group(dead)) console.log(`  ${k}-* (${list.length}): ${list.slice(0, 14).join(' ')}${list.length > 14 ? ' …' : ''}`)
console.log(`\n── UNSTYLED: ${unstyled.length} composed but not defined ──`)
for (const [k, list] of group(unstyled)) console.log(`  ${k}* (${list.length}): ${list.slice(0, 10).join(' ')}${list.length > 10 ? ' …' : ''}`)
process.exit(risks.length ? 1 : 0)
