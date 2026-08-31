#!/usr/bin/env node
/* Remove the stylesheet left behind by a deleted screen.
 *
 * Uses PostCSS, not a regex: a hand-rolled brace walker does not understand
 * comments, and styles.css is full of them — the first attempt at this produced
 * a stylesheet that still had balanced braces and still failed to parse.
 *
 * Conservative by construction:
 *   • only touches selectors in FAMILIES named below;
 *   • a grouped selector loses only the dead parts, never the live ones;
 *   • a rule is removed only when EVERY class it targets is dead;
 *   • "dead" means no string anywhere in src/ composes it, including via a
 *     prefix ('tip tip-' + place), so a computed class name counts as live.
 */
import postcss from 'postcss'
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'

const FAMILIES = /^(cal|yc|wt|mv|wd|mc|rbc|cal2|att)(-|$)/
const CSS = process.argv[2] || 'src/styles.css'
const SRC = process.argv[3] || 'src'
const WRITE = process.argv.includes('--write')

const walk = (d, o = []) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p, o)
    else if (['.jsx', '.js'].includes(extname(p))) o.push(p)
  }
  return o
}
const live = new Set(), prefixes = new Set()
for (const f of walk(SRC)) {
  for (const m of readFileSync(f, 'utf8').matchAll(/'([^']*)'|"([^"]*)"|`([^`$]*)`/g)) {
    const t = m[1] ?? m[2] ?? m[3] ?? ''
    for (const part of t.split(/\s+/).filter(Boolean)) {
      live.add(part)
      if (/[-_]$/.test(part)) prefixes.add(part)
    }
  }
}
const isLive = (c) => live.has(c) || [...prefixes].some((p) => c.startsWith(p) && c.length > p.length)

const css = readFileSync(CSS, 'utf8')
const root = postcss.parse(css, { from: CSS })
let dropped = 0, trimmed = 0
const deadSel = (sel) => {
  const cls = [...sel.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1])
  return cls.length > 0 && cls.some((c) => FAMILIES.test(c)) && cls.every((c) => !isLive(c))
}
root.walkRules((rule) => {
  if (rule.parent?.type === 'atrule' && /keyframes/i.test(rule.parent.name)) return
  const keep = rule.selectors.filter((s) => !deadSel(s))
  if (keep.length === 0) { dropped++; rule.remove(); return }
  if (keep.length !== rule.selectors.length) { trimmed++; rule.selectors = keep }
})
// an @media left with nothing in it goes too
root.walkAtRules((at) => { if (at.nodes && at.nodes.length === 0) at.remove() })

const out = root.toResult().css
console.log(`rules removed: ${dropped}   grouped selectors trimmed: ${trimmed}`)
console.log(`${css.length} -> ${out.length} bytes (${(100 * (css.length - out.length) / css.length).toFixed(1)}% smaller)`)
if (WRITE) { writeFileSync(CSS, out); console.log('written') } else console.log('(dry run — pass --write)')
