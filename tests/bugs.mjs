import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { extname, join } from 'path'
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.pdf':'application/pdf'}
const srv=createServer((q,r)=>{let p=join('/tmp/sgastest/dist',decodeURIComponent(q.url.split('?')[0]))
 if(!existsSync(p)||p.endsWith('/'))p='/tmp/sgastest/dist/index.html'
 r.writeHead(200,{'Content-Type':T[extname(p)]||'application/octet-stream'});r.end(readFileSync(p))}).listen(4195)
const br=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'})
const c=await br.newContext({viewport:{width:1500,height:980},deviceScaleFactor:2});const p=await c.newPage()
const errs=[];p.on('pageerror',e=>errs.push(String(e)))
p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text())})
await p.goto('http://localhost:4195',{waitUntil:'networkidle'});await p.waitForTimeout(400)
await p.locator('input[type=text]').first().fill('admin');await p.locator('input[type=password]').first().fill('demo')
await p.locator('button').first().click();await p.waitForTimeout(1200)
await p.evaluate(()=>{const x=[...document.querySelectorAll('.nav button')].find(e=>e.textContent.includes('new look'));x&&x.click()})
await p.waitForTimeout(1200)

const pass=[],fail=[]
const chk=(ok,msg)=>{(ok?pass:fail).push(msg);console.log((ok?'PASS  ':'FAIL  ')+msg)}
const setView=async(v)=>{await p.evaluate(n=>{const g=document.querySelector('.cx-seg[aria-label="View"]');const b=[...g.querySelectorAll('button')].find(e=>e.textContent.trim()===n);b&&b.click()},v);await p.waitForTimeout(700)}
const stepMonth=async(d)=>{await p.evaluate(i=>document.querySelectorAll('.cx-steps button')[i].click(),d<0?0:1);await p.waitForTimeout(600)}
// walk to a month that actually has courses
await setView('Month')
let found=0
const seek=async(dir,max)=>{for(let i=0;i<max;i++){
  const n=await p.evaluate(()=>document.querySelectorAll('.cx-bar').length)
  if(n>=2)return n
  await stepMonth(dir)}
  return 0}
found=await seek(1,4)
if(!found){for(let i=0;i<4;i++)await stepMonth(-1);found=await seek(-1,10)}
console.log('month with data: '+await p.evaluate(()=>document.querySelector('.cx-title').textContent)+' — '+found+' bars\n')

// ---------- 1. views render ----------
for(const v of ['Day','Week','Month','Year']){
  await setView(v)
  const n=await p.evaluate(()=>document.querySelectorAll('.cx-bar,.cx-ybar').length)
  const grid=await p.evaluate(()=>({days:!!document.querySelector('.cx-days'),year:!!document.querySelector('.cx-year'),month:!!document.querySelector('.cx-week')}))
  const want={Day:'days',Week:'days',Month:'month',Year:'year'}[v]
  chk(grid[want],`${v} view renders its grid (${JSON.stringify(grid)})`)
  await p.screenshot({path:`/home/claude/cx-${v.toLowerCase()}.png`})
  console.log(`      ${v}: ${n} bars`)
}

// ---------- 2. resize must not open the modal ----------
await setView('Month')
const bars=async()=>p.evaluate(()=>[...document.querySelectorAll('.cx-bar')].map(el=>{
  const r=el.getBoundingClientRect(),w=el.closest('.cx-week')
  return {t:el.textContent.trim().replace(/\s+/g,' ').slice(0,30),w:Math.round(r.width),
          row:[...document.querySelectorAll('.cx-week')].indexOf(w),
          x:Math.round(r.x),right:Math.round(r.x+r.width)}}))
const colW=(await p.locator('.cx-week').first().boundingBox()).width/7
const dialogOpen=()=>p.evaluate(()=>!!document.querySelector('[role="dialog"]'))

const resize=async(idx,cols)=>{
  const b=await p.locator('.cx-bar').nth(idx).boundingBox()
  await p.mouse.move(b.x+b.width-6,b.y+b.height/2)
  await p.mouse.down()
  await p.mouse.move(b.x+b.width-6+cols*colW,b.y+b.height/2,{steps:14})
  await p.waitForTimeout(150)
  await p.mouse.up()
  await p.waitForTimeout(1500)
}

const before=await bars()
console.log('\nBEFORE:',JSON.stringify(before.slice(0,4)))
await resize(1,3)
chk(!(await dialogOpen()),'BUG A — no dialog opens after a resize drag')
if(await dialogOpen()){await p.keyboard.press('Escape');await p.waitForTimeout(400)}
const after1=await bars()
chk(after1[1].w>before[1].w+colW*0.5,`resize grew the bar (${before[1].w} -> ${after1[1].w})`)

// ---------- 3. shrink a multi-row course back down ----------
const segsOf=(bid)=>p.evaluate(id=>[...document.querySelectorAll('.cx-week .cx-bar')]
  .map((el,i)=>({i,bid:el.dataset.bid,head:el.dataset.head,
    row:[...document.querySelectorAll('.cx-week')].indexOf(el.closest('.cx-week')),
    w:Math.round(el.getBoundingClientRect().width)}))
  .filter(x=>x.bid===id),bid)
// pick a bar with room to the right of it inside its week
const pick=await p.evaluate(()=>{
  const all=[...document.querySelectorAll('.cx-week .cx-bar')]
  const wk=document.querySelector('.cx-week').getBoundingClientRect(),cw=wk.width/7
  let best=null,room=0
  all.forEach((el,i)=>{const r=el.getBoundingClientRect();const rm=(wk.right-r.right)/cw
    if(rm>2.5&&r.width<cw*4&&rm>room){room=rm;best={i,bid:el.dataset.bid}}})
  return best})
console.log('\nstretching',JSON.stringify(pick))
if(!pick){chk(false,'found a bar with room to stretch')}else{
  await resize(pick.i,5)
  await p.waitForTimeout(400)
  const after=await segsOf(pick.bid)
  console.log('  segments after stretch:',JSON.stringify(after))
  chk(after.length>1,`BUG B setup — course now spans ${after.length} week rows`)
  chk(!(await dialogOpen()),'BUG A — no dialog after stretching across a week boundary')
  if(await dialogOpen()){await p.keyboard.press('Escape');await p.waitForTimeout(400)}
  await p.screenshot({path:'/home/claude/cx-stretched.png'})
  if(after.length>1){
    const lastIdx=after[after.length-1].i
    const totalBefore=after.reduce((s,x)=>s+x.w,0)
    await resize(lastIdx,-3)
    chk(!(await dialogOpen()),'BUG A — no dialog after shrinking across rows')
    if(await dialogOpen()){await p.keyboard.press('Escape');await p.waitForTimeout(400)}
    const back=await segsOf(pick.bid)
    const totalAfter=back.reduce((s,x)=>s+x.w,0)
    console.log(`  segments ${after.length} -> ${back.length}, total px ${totalBefore} -> ${totalAfter}`)
    chk(totalAfter<totalBefore-colW*0.5,`BUG B — multi-row course shrinks back down (${totalBefore} -> ${totalAfter} px)`)
    // Keep shrinking the tail until the course collapses back to one row —
    // this is the exact move Chris said was impossible.
    let cur=back
    for(let n=0;n<6&&cur.reduce((s,x)=>s+x.w,0)>colW*4.4;n++){
      await resize(cur[cur.length-1].i,-3)
      if(await dialogOpen()){chk(false,'BUG A — dialog opened during repeated shrink');await p.keyboard.press('Escape');await p.waitForTimeout(400)}
      cur=await segsOf(pick.bid)
      console.log(`  shrink ${n+1}: ${cur.length} row(s), ${cur.reduce((s,x)=>s+x.w,0)} px`)
    }
    chk(cur.length===1,`BUG B — course collapsed all the way back to a single week row (${cur.length})`)
    chk(cur[0]&&cur[0].w<colW*5,`BUG B — and back down to about ${Math.round((cur[0]?.w||0)/colW)} days`)
  }
  await p.screenshot({path:'/home/claude/cx-shrunk.png'})
}

// ---------- 4. view switching keeps the date you were looking at ----------
const titleMonth=await p.evaluate(()=>document.querySelector('.cx-title').textContent)
await setView('Week')
const wTitle=await p.evaluate(()=>document.querySelector('.cx-title').textContent)
console.log(`\nMonth "${titleMonth}" -> Week "${wTitle}"`)
chk(wTitle.includes(titleMonth.split(' ')[0].slice(0,3)),`Week view stays in ${titleMonth} (got "${wTitle}")`)

// ---------- 5. drag in Week view ----------
let wBars=0
for(let i=0;i<6;i++){
  wBars=await p.evaluate(()=>document.querySelectorAll('.cx-band .cx-bar').length)
  if(wBars)break
  await stepMonth(-1)
}
console.log('Week all-day bars:',wBars,'in',await p.evaluate(()=>document.querySelector('.cx-title').textContent))
await p.screenshot({path:'/home/claude/cx-week2.png'})
if(wBars>0){
  const cw=(await p.locator('.cx-band').first().boundingBox()).width/7
  const b=await p.locator('.cx-band .cx-bar').first().boundingBox()
  const w0=b.width
  await p.mouse.move(b.x+b.width-6,b.y+b.height/2);await p.mouse.down()
  await p.mouse.move(b.x+b.width-6+cw,b.y+b.height/2,{steps:10});await p.waitForTimeout(120)
  await p.mouse.up();await p.waitForTimeout(1400)
  const w1=(await p.locator('.cx-band .cx-bar').first().boundingBox()).width
  chk(!(await dialogOpen()),'Week view: no dialog after resize')
  if(await dialogOpen()){await p.keyboard.press('Escape');await p.waitForTimeout(300)}
  chk(Math.abs(w1-w0)>cw*0.4,`Week view: resize moved the edge (${Math.round(w0)} -> ${Math.round(w1)})`)
}else{chk(false,'Week view has all-day bars to drag')}

// ---------- 6. hour grid collapses when nothing is timed ----------
const collapsed=await p.evaluate(()=>!!document.querySelector('.cx-hours-toggle')&&!document.querySelector('.cx-time'))
chk(collapsed,'Week: empty hour grid is collapsed to a one-line toggle')
if(collapsed){
  await p.locator('.cx-hours-toggle').click();await p.waitForTimeout(300)
  chk(await p.evaluate(()=>!!document.querySelector('.cx-time')),'Week: toggle reveals the hour grid')
  const clip=await p.evaluate(()=>{const t=document.querySelector('.cx-time'),h=t.querySelector('.cx-hour span')
    return h.getBoundingClientRect().top-t.getBoundingClientRect().top})
  console.log('  first hour label offset inside scroller:',Math.round(clip))
  chk(clip>=0,`07:00 label is not clipped by the all-day divider (offset ${Math.round(clip)})`)
  await p.screenshot({path:'/home/claude/cx-week-hours.png'})
  const hide=await p.evaluate(()=>[...document.querySelectorAll('.cx-hours-toggle')].some(b=>b.textContent.includes('hide')))
  chk(hide,'Week: an empty hour grid offers a visible way to hide it again')
  await p.evaluate(()=>{const b=[...document.querySelectorAll('.cx-hours-toggle')].find(e=>e.textContent.includes('hide'));b&&b.click()})
  await p.waitForTimeout(300)
  chk(!(await p.evaluate(()=>!!document.querySelector('.cx-time'))),'Week: hiding it works')
}

// ---------- 7. Day view is a roster, not an empty hour column ----------
await setView('Day')
// walk to a day that has a course on it
for(let i=0;i<8;i++){ if(await p.evaluate(()=>document.querySelectorAll('.cx-rcard').length))break; await stepMonth(1)}
const rc=await p.evaluate(()=>[...document.querySelectorAll('.cx-rcard')].map(el=>({
  name:el.querySelector('.cx-rname')?.textContent,
  trainer:el.querySelector('.cx-rtrainer')?.textContent,
  people:[...el.querySelectorAll('.cx-rlist li b')].map(b=>b.textContent)})))
console.log('\nDay roster:',JSON.stringify(rc))
chk(rc.length>0,'Day view shows a roster card per course')
chk(!(await p.evaluate(()=>!!document.querySelector('.cx-band'))),'Day view no longer repeats the course in an all-day strip')
chk(rc[0]&&/trainer|Trainer|[A-Z]/.test(rc[0].trainer||''),'Day roster names the trainer (or says there is none)')
await p.waitForTimeout(300);await p.screenshot({path:'/home/claude/cx-day2.png'})

// ---------- 8. jump to a month ----------
await setView('Month')
const t0=await p.evaluate(()=>document.querySelector('.cx-title').textContent)
await p.locator('button.cx-title').click();await p.waitForTimeout(250)
chk(await p.evaluate(()=>!!document.querySelector('.cx-jump')),'Month picker opens from the title')
await p.screenshot({path:'/home/claude/cx-jump.png'})
await p.evaluate(()=>{const b=[...document.querySelectorAll('.cx-jump-g button')].find(e=>e.textContent.trim()==='Nov');b.click()})
await p.waitForTimeout(500)
const t1=await p.evaluate(()=>document.querySelector('.cx-title').textContent)
chk(t1.startsWith('November'),`One click from ${t0} to November (got "${t1}")`)
chk(!(await p.evaluate(()=>!!document.querySelector('.cx-jump'))),'Picker closes after choosing')

await setView('Year');await p.waitForTimeout(600);await p.screenshot({path:'/home/claude/cx-year2.png'})
const ticks=await p.evaluate(()=>[...document.querySelectorAll('.cx-ytick.on')].map(e=>e.textContent))
chk(ticks.length>=6,`Year view has a day scale (${ticks.join(',')})`)
const align=await p.evaluate(()=>[...document.querySelectorAll('.cx-ytrack')].slice(1).map(t=>{
  const c=t.querySelector('.cx-ycell');return c?Math.round(c.getBoundingClientRect().width*10)/10:0}))
console.log('  first-cell widths per month row:',JSON.stringify([...new Set(align)]))
chk(new Set(align).size===1,`Year: every month row is on the same day scale (${[...new Set(align)].join('/')})`)
// A bar's width IS the course's dates. A name that will not fit is dropped
// rather than spilled outside, which would say the course runs on days it does
// not — the tooltip and the rail still carry it.
const yb=await p.evaluate(()=>[...document.querySelectorAll('.cx-ybar')].map(b=>{
  const r=b.getBoundingClientRect(),t=b.querySelector('.cx-bar-t')
  const tr=t&&t.getBoundingClientRect()
  return {w:Math.round(r.width),text:(t?.textContent||'').trim(),
    tw:tr?Math.round(tr.width):0,tip:(b.getAttribute('title')||'').slice(0,24)}}))
console.log('  year bars:',JSON.stringify(yb))
chk(yb.length>0,'Year view has bars')
chk(yb.every(x=>x.tw<=x.w+1),'Year: no label reaches past its own course bar')
chk(yb.every(x=>x.tip&&x.tip.trim()),'Year: every bar names its course in a tooltip, labelled or not')
chk(yb.some(x=>x.text),'Year: bars wide enough to hold a name still show one')
// a course that starts on the 1st must sit at x=0 whatever month it is in
await setView('Day');await p.waitForTimeout(300)
await setView('Month');await p.waitForTimeout(400)
const na=await p.evaluate(()=>{const h=[...document.querySelectorAll('.cx-card h3')].find(e=>/Needs attention/i.test(e.textContent));
  return h?h.textContent:null})
console.log('  November rail:',na)
chk(!!na,'Needs attention follows you when you page to an empty month')
await p.screenshot({path:'/home/claude/cx-month.png'})

// ---------- 9. the anchored popover ----------
await setView('Month')
await (async()=>{for(let i=0;i<8;i++){if(await p.evaluate(()=>document.querySelectorAll('.cx-bar').length>=2))return;await stepMonth(-1)}})()
const bb=await p.locator('.cx-bar').nth(1).boundingBox()
await p.locator('.cx-bar').nth(1).click();await p.waitForTimeout(400)
const pop=await p.evaluate(()=>{const el=document.querySelector('.cx-pop');if(!el)return null
  const r=el.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),
   cls:el.className,dialog:el.getAttribute('role'),
   title:!!el.querySelector('.cx-pop-title'),when:el.querySelectorAll('.cx-when-b').length,rows:el.querySelectorAll('.cx-row2').length}})
console.log('\npopover:',JSON.stringify(pop))
chk(!!pop,'Clicking a course opens a popover')
chk(pop&&pop.dialog==='dialog','It is announced as a dialog')
chk(pop&&pop.when===2,'Two date blocks side by side')
chk(pop&&pop.rows>=3,`Icon-led rows (${pop&&pop.rows})`)
const vw=1500,vh=980
const centred=pop&&Math.abs((pop.x+pop.w/2)-vw/2)<40&&Math.abs((pop.y+pop.h/2)-vh/2)<40
chk(!centred,`Anchored beside the bar, not centred (bar x=${Math.round(bb.x)}..${Math.round(bb.x+bb.width)}, pop x=${pop&&pop.x})`)
const near=pop&&(Math.abs(pop.x-(bb.x+bb.width))<40||Math.abs((pop.x+pop.w)-bb.x)<40||Math.abs(pop.y-(bb.y+bb.height))<40)
chk(near,'It sits next to the bar it belongs to')
// the whole point: you can still see the course you opened
const covers=pop&&!(pop.y>=bb.y+bb.height-2||pop.y+pop.h<=bb.y+2||pop.x>=bb.x+bb.width-2||pop.x+pop.w<=bb.x+2)
chk(!covers,'It does not cover the course you opened')
chk(await p.evaluate(()=>!!document.querySelector('.cx-pop-caret')),'A caret tethers it to the bar')
chk(await p.evaluate(()=>!!document.querySelector('.cx-pop-foot')),'It says changes save as you make them')
chk(await p.evaluate(()=>document.querySelectorAll('.cx-rlabel').length>=3),'Every row is labelled')
chk(pop&&pop.x>=8&&pop.x+pop.w<=vw-8&&pop.y>=8&&pop.y+pop.h<=vh-8,'It is fully on screen')
chk(await p.evaluate(()=>!document.querySelector('.cal-modal-wrap')&&!!document.querySelector('.cx-grid, .cx-week')),
    'The calendar is still visible behind it')
const hasSave=await p.evaluate(()=>[...document.querySelectorAll('.cx-pop button')].some(b=>/^save$/i.test(b.textContent.trim())))
chk(!hasSave,'No Save button — changes commit as you make them')
const t_before=await p.evaluate(()=>document.querySelector('.cx-row2 select')?.value)
await p.evaluate(()=>{const s=document.querySelector('.cx-row2 select')
  const o=[...s.options].find(o=>o.value&&o.value!==s.value);s.value=o.value
  s.dispatchEvent(new Event('change',{bubbles:true}))})
await p.waitForTimeout(1600)
const t_after=await p.evaluate(()=>document.querySelector('.cx-row2 select')?.value)
console.log('  trainer',t_before,'->',t_after)
chk(t_after&&t_after!==t_before,'Picking a trainer saves straight away')
chk(await p.evaluate(()=>!!document.querySelector('.cx-pop')),'And the popover stays open after saving')
await p.screenshot({path:'/home/claude/cx-pop.png'})
await p.keyboard.press('Escape');await p.waitForTimeout(350)
chk(!(await p.evaluate(()=>!!document.querySelector('.cx-pop'))),'Escape closes it')
await p.locator('.cx-bar').nth(1).click();await p.waitForTimeout(400)
await p.mouse.click(700,62);await p.waitForTimeout(400)
chk(!(await p.evaluate(()=>!!document.querySelector('.cx-pop'))),'Clicking outside closes it')
await p.locator('.cx-bar').last().click();await p.waitForTimeout(450)
const p2=await p.evaluate(()=>{const el=document.querySelector('.cx-pop');if(!el)return null
  const r=el.getBoundingClientRect();return {x:Math.round(r.x),w:Math.round(r.width),cls:el.className}})
console.log('  edge case:',JSON.stringify(p2))
chk(p2&&p2.x>=8&&p2.x+p2.w<=1500-8,'A course near the edge flips instead of running off screen')
await p.keyboard.press('Escape');await p.waitForTimeout(300)

// ---------- 10. drag chip rides the bar ----------
const cb=await p.locator('.cx-bar').nth(1).boundingBox()
const cw2=(await p.locator('.cx-week').first().boundingBox()).width/7
await p.mouse.move(cb.x+cb.width-6,cb.y+cb.height/2);await p.mouse.down()
await p.mouse.move(cb.x+cb.width-6+2*cw2,cb.y+cb.height/2,{steps:12});await p.waitForTimeout(200)
const chipInfo=await p.evaluate(()=>{const c=document.querySelector('.cx-chip-len');if(!c)return null
  const r=c.getBoundingClientRect(),b=c.closest('.cx-bar').getBoundingClientRect()
  return {text:c.textContent,onBar:r.left>b.left-40&&r.right<b.right+40&&r.top>b.top-30&&r.bottom<b.bottom+30}})
console.log('  drag chip:',JSON.stringify(chipInfo))
chk(!!chipInfo,'A duration chip appears while you drag')
chk(chipInfo&&/day/.test(chipInfo.text),`It says how long (${chipInfo&&chipInfo.text})`)
chk(chipInfo&&chipInfo.onBar,'It rides the bar rather than the cursor')
await p.screenshot({path:'/home/claude/cx-chip.png'})
await p.mouse.up();await p.waitForTimeout(1300)
chk(!(await p.evaluate(()=>!!document.querySelector('.cx-chip-len'))),'The chip goes when you let go')
chk(!(await p.evaluate(()=>!!document.querySelector('.cx-pop'))),'And letting go still does not open the course')

// round handles
const dots=await p.evaluate(()=>{const b=document.querySelector('.cx-bar')
  return {grab:!!b.querySelector('.cx-grab'),resize:!!b.querySelector('.cx-resize'),
    style:getComputedStyle(b.querySelector('.cx-resize'),'::after').borderRadius}})
chk(dots.grab&&dots.resize,'Both handles are on the bar')

// ---------- 11. phone: it becomes a sheet ----------
await p.setViewportSize({width:390,height:844});await p.waitForTimeout(800)
await p.evaluate(()=>{const b=document.querySelector('.cx-bar');b&&b.click()})
await p.waitForTimeout(600)
const sheet=await p.evaluate(()=>{const el=document.querySelector('.cx-pop');if(!el)return null
  const r=el.getBoundingClientRect();return {sheet:el.classList.contains('sheet'),x:Math.round(r.x),w:Math.round(r.width),
   scrim:!!document.querySelector('.cx-pop-scrim')}})
console.log('  phone:',JSON.stringify(sheet))
chk(sheet&&sheet.sheet,'On a phone it becomes a bottom sheet')
chk(sheet&&sheet.w<=390&&sheet.x>=0,'The sheet fits the phone width')
chk(sheet&&sheet.scrim,'With a scrim behind it')
await p.screenshot({path:'/home/claude/cx-pop-phone.png'})
await p.setViewportSize({width:1500,height:980});await p.waitForTimeout(500)

// ---------- 12. the rail collapses ----------
await setView('Month')
await p.evaluate(()=>{const e=document.querySelector('.cx-pop');if(e)document.body.click()})
await p.keyboard.press('Escape');await p.waitForTimeout(300)
const railVisible=()=>p.evaluate(()=>{const r=document.querySelector('.cx-rail')
  return !!r&&getComputedStyle(r).display!=='none'&&r.getBoundingClientRect().height>0})
const railOn=await railVisible()
const gridW=async()=>p.evaluate(()=>Math.round(document.querySelector('.cx-cal').getBoundingClientRect().width))
const w0=await gridW()
await p.locator('.cx-railbtn').click();await p.waitForTimeout(500)
const railOff=await railVisible()
const w1=await gridW()
console.log(`\nrail ${railOn?'open':'closed'} -> ${railOff?'open':'closed'}, calendar ${w0} -> ${w1}px`)
chk(railOn!==railOff,'The side panel toggles')
chk(Math.abs(w1-w0)>200,`The calendar takes the space back (${w0} -> ${w1}px)`)
await p.screenshot({path:'/home/claude/cx-norail.png'})
// closed, the button tells you there is something waiting
const badge=await p.evaluate(()=>document.querySelector('.cx-railbtn em')?.textContent)
console.log('  badge when closed:',badge)
chk(!railOff?!!badge:true,`Closed, it shows how many need attention (${badge})`)
// and it is remembered
await p.reload({waitUntil:'networkidle'});await p.waitForTimeout(1400)
if(await p.evaluate(()=>!!document.querySelector('input[type=password]'))){
  await p.locator('input[type=text]').first().fill('admin');await p.locator('input[type=password]').first().fill('demo')
  await p.locator('button').first().click();await p.waitForTimeout(1400)}
await p.evaluate(()=>{const x=[...document.querySelectorAll('.nav button')].find(e=>e.textContent.includes('new look'));x&&x.click()})
await p.waitForTimeout(1400)
chk((await railVisible())===railOff,'It remembers whether it was open')
chk(!railOff,'Closed really means gone, not pushed under the calendar')
await p.locator('.cx-railbtn').click();await p.waitForTimeout(500)

// ---------- 13. the attendee selector is colour-coded ----------
await setView('Month')
await (async()=>{for(let i=0;i<10;i++){if(await p.evaluate(()=>document.querySelectorAll('.cx-bar').length>=2))return;await stepMonth(-1)}})()
await p.locator('.cx-bar').nth(1).click();await p.waitForTimeout(600)
await p.evaluate(()=>document.querySelector('.cx-add summary').click());await p.waitForTimeout(400)
const chips=await p.evaluate(()=>[...document.querySelectorAll('.cx-pchip')].map(el=>({
  name:el.querySelector('b')?.textContent,scheme:el.querySelector('small')?.textContent,
  line:getComputedStyle(el).borderLeftColor,fits:el.classList.contains('fits')})))
console.log('\nselector chips:',JSON.stringify(chips.slice(0,5),null,0))
chk(chips.length>0,'The waiting list shows as chips')
chk(chips.every(c=>c.scheme&&c.scheme.trim()),'Each says which scheme they are waiting for')
const colours=new Set(chips.map(c=>c.line))
chk(colours.size>1,`Each carries a colour line for that scheme (${colours.size} distinct)`)
// same scheme as the open course sorts to the front
const firstFits=chips.findIndex(c=>c.fits),lastFits=chips.map(c=>c.fits).lastIndexOf(true)
if(firstFits>=0)chk(lastFits<chips.filter(c=>c.fits).length,'The ones that fit this course come first')
await p.screenshot({path:'/home/claude/cx-selector.png'})
await p.keyboard.press('Escape');await p.waitForTimeout(300)

// ---------- 14. drag across days to book a course, in every view ----------
const popOpen=()=>p.evaluate(()=>!!document.querySelector('.cx-pop'))
const closePop=async()=>{if(await popOpen()){await p.keyboard.press('Escape');await p.waitForTimeout(350)}
  if(await popOpen()){await p.evaluate(()=>document.querySelector('.cx-pop .cx-icon').click());await p.waitForTimeout(350)}}
const countBars=()=>p.evaluate(()=>document.querySelectorAll('.cx-bar,.cx-ybar').length)

const dragDays=async(sel,from,to)=>{
  const a=await p.evaluate(([s,d])=>{const e=document.querySelector(`${s}[data-d="${d}"]`);if(!e)return null
    const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}},[sel,from])
  const b=await p.evaluate(([s,d])=>{const e=document.querySelector(`${s}[data-d="${d}"]`);if(!e)return null
    const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}},[sel,to])
  if(!a||!b)return null
  await p.mouse.move(a.x,a.y);await p.mouse.down()
  await p.mouse.move((a.x+b.x)/2,(a.y+b.y)/2,{steps:6})
  await p.mouse.move(b.x,b.y,{steps:8});await p.waitForTimeout(200)
  const mid=await p.evaluate(()=>({sel:document.querySelectorAll('[data-d].sel').length,
    hint:document.querySelector('.cx-chip-len')?.textContent||null}))
  await p.mouse.up();await p.waitForTimeout(600)
  return mid
}

for(const [view,sel,from,to] of [
  ['Year','.cx-ycell','2026-10-05','2026-10-08'],
  ['Month','.cx-cell',null,null],
  ['Week','.cx-band-cell',null,null],
]){
  await closePop()
  await setView(view)
  if(view==='Year'){await p.evaluate(()=>{const t=document.querySelector('.cx-title');})}
  // find two empty days in this grid to drag between
  // pick three consecutive day cells whose centres are not under an existing bar
  const pair=await p.evaluate(s=>{
    const bars=[...document.querySelectorAll('.cx-bar,.cx-ybar')].map(b=>b.getBoundingClientRect())
    const free=(el)=>{const r=el.getBoundingClientRect()
      const x=r.x+r.width/2,y=r.y+r.height/2
      return r.width>2&&r.height>2&&!bars.some(b=>x>=b.left-1&&x<=b.right+1&&y>=b.top-1&&y<=b.bottom+1)}
    const cells=[...document.querySelectorAll(s+'[data-d]')]
    for(let i=0;i<cells.length-2;i++){
      const run=[cells[i],cells[i+1],cells[i+2]]
      // must be in the same row, i.e. adjacent days rising left to right
      if(run.every(free)&&run[2].getBoundingClientRect().x>run[0].getBoundingClientRect().x
         &&Math.abs(run[2].getBoundingClientRect().y-run[0].getBoundingClientRect().y)<4)
        return [run[0].dataset.d,run[2].dataset.d]}
    return null},sel)
  if(!pair){chk(false,`${view}: has day cells to drag across`);continue}
  const n0=await countBars()
  const mid=await dragDays(sel,pair[0],pair[1])
  chk(mid&&mid.sel>=2,`${view}: dragging across days highlights them (${mid&&mid.sel})`)
  chk(mid&&/day/.test(mid.hint||''),`${view}: and says how long (${mid&&mid.hint})`)
  const opened=await popOpen()
  chk(opened,`${view}: letting go opens the booking panel`)
  if(opened){
    const info=await p.evaluate(()=>{const el=document.querySelector('.cx-pop')
      return {title:el.querySelector('.cx-pop-title')?.textContent,
        dates:[...el.querySelectorAll('.cx-when-b b')].map(b=>b.textContent),
        len:el.querySelector('.cx-when-len')?.textContent,
        picker:!!el.querySelector('.cx-row2 select'),
        book:[...el.querySelectorAll('button')].some(b=>/book it/i.test(b.textContent))}})
    console.log(`  ${view}:`,JSON.stringify(info))
    chk(info.title==='New course',`${view}: it is the booking panel (got "${String(info.title).slice(0,40)}")`)
    chk(info.dates.length===2&&info.len,`${view}: pre-filled with the days you dragged (${info.dates.join(' – ')}, ${info.len})`)
    chk(info.picker&&info.book,`${view}: with a course picker and a Book it button`)
    await p.screenshot({path:`/home/claude/cx-create-${view.toLowerCase()}.png`})
    // actually book one, from the Year view
    if(view==='Year'){
      await p.evaluate(()=>{const s=document.querySelector('.cx-pop .cx-row2 select')
        s.value=[...s.options].find(o=>o.value).value;s.dispatchEvent(new Event('change',{bubbles:true}))})
      await p.waitForTimeout(400)
      await p.evaluate(()=>{const b=[...document.querySelectorAll('.cx-pop button')].find(b=>/book it/i.test(b.textContent));if(b)b.click()})
      await p.waitForTimeout(2200)
      const n1=await countBars()
      console.log(`  Year: bars ${n0} -> ${n1}`)
      chk(n1>n0,`Year: booking it actually adds the course to the year (${n0} -> ${n1})`)
      chk(await popOpen(),'Year: and opens the new course so you can staff it')
      await p.screenshot({path:'/home/claude/cx-created-year.png'})
    }
    await closePop()
  }
}
// a plain click must not book anything
await closePop();await setView('Year')
const n2=await countBars()
await p.evaluate(()=>{const c=document.querySelectorAll('.cx-ycell[data-d]');c[Math.floor(c.length*0.6)].scrollIntoView()})
const one=await p.evaluate(()=>{const c=[...document.querySelectorAll('.cx-ycell[data-d]')]
  const r=c[Math.floor(c.length*0.6)].getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})
await p.mouse.click(one.x,one.y);await p.waitForTimeout(700)
chk(!(await popOpen()),'A plain click books nothing — it takes a drag')
chk((await countBars())===n2,'And adds no course')
// a course can straddle two months in Year view
await closePop();await setView('Year')
// the click test above scrolled; bring the year grid back on screen or the
// coordinates come out negative and the pointer never lands on a cell
await p.evaluate(()=>window.scrollTo(0,0));await p.waitForTimeout(400)
const cross=await p.evaluate(()=>{
  const bars=[...document.querySelectorAll('.cx-ybar')].map(b=>b.getBoundingClientRect())
  const free=(el)=>{const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2
    return !bars.some(b=>x>=b.left-1&&x<=b.right+1&&y>=b.top-1&&y<=b.bottom+1)}
  const pick=(d)=>[...document.querySelectorAll(`.cx-ycell[data-d="${d}"]`)].find(free)
  const y=new Date().getUTCFullYear()
  const a=pick(`${y}-03-30`),b=pick(`${y}-04-02`)
  if(!a||!b)return {diag:{y,cells:document.querySelectorAll('.cx-ycell').length,
    a:!!document.querySelector(`.cx-ycell[data-d="${y}-03-30"]`),
    b:!!document.querySelector(`.cx-ycell[data-d="${y}-04-02"]`),
    title:document.querySelector('.cx-title')?.textContent,
    bars:[...document.querySelectorAll('.cx-ybar')].length}}
  const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect()
  const on=(r)=>r.top>2&&r.bottom<window.innerHeight-2
  if(!on(ra)||!on(rb))return {diag:{why:'off screen',a:Math.round(ra.y),b:Math.round(rb.y),vh:window.innerHeight}}
  return {a:{x:ra.x+ra.width/2,y:ra.y+ra.height/2},b:{x:rb.x+rb.width/2,y:rb.y+rb.height/2}}})
if(cross&&cross.diag){console.log('  cross diag:',JSON.stringify(cross.diag))}
if(cross&&!cross.diag){
  await p.mouse.move(cross.a.x,cross.a.y);await p.mouse.down()
  await p.mouse.move(cross.b.x,cross.b.y,{steps:12});await p.waitForTimeout(200)
  console.log('  mid-drag:',JSON.stringify(await p.evaluate(()=>({
    sel:document.querySelectorAll('.cx-ycell.sel').length,
    chip:document.querySelector('.cx-chip-len')?.textContent||null,
    ghost:!!document.querySelector('.cx-draghost')}))))
  await p.mouse.up();await p.waitForTimeout(900)
  console.log('  after up:',JSON.stringify(await p.evaluate(()=>({
    pop:!!document.querySelector('.cx-pop'),placing:!!document.querySelector('.cx-placing'),
    title:document.querySelector('.cx-pop .cx-pop-title')?.textContent||null}))))
  const d=await p.evaluate(()=>{const el=document.querySelector('.cx-pop');if(!el)return null
    return {t:el.querySelector('.cx-pop-title')?.textContent,
      dates:[...el.querySelectorAll('.cx-when-b b')].map(b=>b.textContent),
      len:el.querySelector('.cx-when-len')?.textContent}})
  console.log('  cross-month:',JSON.stringify(d))
  chk(d&&d.t==='New course','Year: you can drag from one month into the next')
  chk(d&&/Mar/.test(d.dates[0])&&/Apr/.test(d.dates[1]),`Year: and it spans both (${d&&d.dates.join(' – ')})`)
  await p.screenshot({path:'/home/claude/cx-create-cross.png'})
  await closePop()
}else{chk(false,'Year: found free cells either side of a month boundary')}

// ---------- 15. the popover follows its course when you scroll ----------
await closePop()
await p.setViewportSize({width:1500,height:700});await p.waitForTimeout(600)
// the rail makes the page tall enough to actually scroll the calendar away
if(!(await p.evaluate(()=>{const r=document.querySelector('.cx-rail');return r&&getComputedStyle(r).display!=='none'}))){
  await p.locator('.cx-railbtn').click();await p.waitForTimeout(500)}
await setView('Month')
await (async()=>{for(let i=0;i<10;i++){if(await p.evaluate(()=>document.querySelectorAll('.cx-bar').length>=2))return;await stepMonth(-1)}})()
await p.evaluate(()=>window.scrollTo(0,0));await p.waitForTimeout(300)
// remember WHICH bar we opened, so we measure the caret against that one
const anchorBid=await p.evaluate(()=>document.querySelectorAll('.cx-bar')[1].dataset.bid)
await p.locator('.cx-bar').nth(1).click();await p.waitForTimeout(600)
console.log('  anchored to bar',anchorBid)

const geo=()=>p.evaluate(bid=>{const el=document.querySelector('.cx-pop');if(!el)return null
  const r=el.getBoundingClientRect()
  const car=document.querySelector('.cx-pop-caret')?.getBoundingClientRect()
  const bar=document.querySelector(`.cx-bar[data-bid="${bid}"]`)?.getBoundingClientRect()
  return {y:Math.round(r.y),x:Math.round(r.x),
    caretY:car?Math.round(car.y+car.height/2):null,caretX:car?Math.round(car.x+car.width/2):null,
    barY:bar?Math.round(bar.y+bar.height/2):null,barTop:bar?Math.round(bar.y):null,
    barBottom:bar?Math.round(bar.y+bar.height):null,
    sw:el.scrollWidth,cw:el.clientWidth,page:Math.round(window.scrollY)}},anchorBid)

const g0=await geo()
chk(!!g0,'Popover open before scrolling')
// how far the caret sits outside the bar it points at
const away=(g)=>g&&g.caretY!=null&&g.barTop!=null
  ? Math.max(0,g.barTop-g.caretY,g.caretY-g.barBottom) : null
const gap0=away(g0)
await p.mouse.move(300,650)
await p.mouse.wheel(0,260);await p.waitForTimeout(600)
const g1=await geo()
console.log('\n  before scroll:',JSON.stringify(g0),'\n  after scroll :',JSON.stringify(g1))
chk(!!g1,'It is still open after scrolling')
chk(g1&&g1.page>100,`The page actually scrolled (${g1&&g1.page}px)`)
chk(g1&&g1.y!==g0.y,`The panel moved with the calendar (${g0.y} -> ${g1.y})`)
// the caret must still be touching the bar it belongs to
const gap1=away(g1)
console.log(`  caret-to-bar gap: ${gap0} -> ${gap1}px`)
chk(gap0!=null&&gap0<=24,`The caret sits on its course to begin with (${gap0}px outside it)`)
chk(gap1!=null&&gap1<=24,`And is still on it after scrolling (${gap1}px outside it)`)
chk(g1&&g1.sw<=g1.cw+1,`No sideways overflow inside the panel (${g1&&g1.sw} vs ${g1&&g1.cw})`)
chk(g1&&g1.y>=8&&g1.x>=8,'And it is still on screen')
await p.screenshot({path:'/home/claude/cx-scrolled.png'})

// A panel pointing at nothing is worse than no panel: page to another month
// with it open and the course it belongs to is gone from the DOM.
await p.evaluate(()=>window.scrollTo(0,0));await p.waitForTimeout(300)
chk(await popOpen(),'Still open before paging away')
await stepMonth(1);await p.waitForTimeout(700)
const gone=await p.evaluate(bid=>({pop:!!document.querySelector('.cx-pop'),
  caret:!!document.querySelector('.cx-pop-caret'),
  bar:!!document.querySelector(`.cx-bar[data-bid="${bid}"]`)}),anchorBid)
console.log('  after paging to the next month:',JSON.stringify(gone))
chk(!gone.bar,'The course is no longer on screen')
chk(!gone.pop&&!gone.caret,'The panel closes with it, instead of pointing at nothing')
await stepMonth(-1);await p.waitForTimeout(500)
await p.setViewportSize({width:1500,height:980});await p.waitForTimeout(500)
await p.evaluate(()=>window.scrollTo(0,0));await p.waitForTimeout(300)
await closePop()

console.log('\n=== errors ===')
;console.log(errs.length?errs.join('\n'):'none')
console.log(`\n=== ${pass.length} pass / ${fail.length} fail ===`)
fail.forEach(f=>console.log('  FAIL '+f))
await br.close();srv.close()
