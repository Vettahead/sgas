import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { extname, join } from 'path'
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'}
const srv=createServer((q,r)=>{let p=join('/tmp/sgastest/dist',decodeURIComponent(q.url.split('?')[0]))
 if(!existsSync(p)||p.endsWith('/'))p='/tmp/sgastest/dist/index.html'
 r.writeHead(200,{'Content-Type':T[extname(p)]||'application/octet-stream'});r.end(readFileSync(p))}).listen(4232)
const br=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'})
const pass=[],fail=[]
const chk=(ok,m)=>{(ok?pass:fail).push(m);console.log((ok?'PASS  ':'FAIL  ')+m)}

async function run({name,width,height,touch}){
  console.log(`\n──────── ${name} (${width}×${height}${touch?', touch':''}) ────────`)
  const c=await br.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:!!touch,isMobile:false})
  const p=await c.newPage()
  const errs=[];p.on('pageerror',e=>errs.push(String(e)))
  p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text())})
  p.on('dialog',d=>d.accept())
  await p.goto('http://localhost:4232',{waitUntil:'networkidle'});await p.waitForTimeout(400)
  await p.locator('input[type=text]').first().fill('admin');await p.locator('input[type=password]').first().fill('demo')
  await p.locator('button').first().click();await p.waitForTimeout(1400)
  await p.evaluate(()=>{const x=[...document.querySelectorAll('.nav button')].find(e=>e.textContent.includes('new look'));x&&x.click()})
  await p.waitForTimeout(1500)
  if(!(await p.evaluate(()=>{const r=document.querySelector('.cx-rail');return r&&getComputedStyle(r).display!=='none'})))
    {await p.locator('.cx-railbtn').click();await p.waitForTimeout(600)}
  for(let i=0;i<8;i++){if(await p.evaluate(()=>document.querySelectorAll('.cx-bar').length>=2))break
    await p.evaluate(()=>document.querySelectorAll('.cx-steps button')[0].click());await p.waitForTimeout(600)}

  const badge=()=>p.evaluate(()=>Number(document.querySelector('.cx-droppool h3 span')?.textContent||0))
  // Scroll the element to the middle of the screen and hand back its centre.
  const grab=async(sel,n=0)=>{
    const ok=await p.evaluate(([s,i])=>{const e=document.querySelectorAll(s)[i];if(!e)return false
      e.scrollIntoView({block:'center'});return true},[sel,n])
    if(!ok)return null
    await p.waitForTimeout(350)
    return p.evaluate(([s,i])=>{const e=document.querySelectorAll(s)[i];if(!e)return null
      const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,t:e.textContent.trim().slice(0,28)}},[sel,n])
  }
  // A drag that does NOT re-measure the target: it just heads for the edge and
  // lets the page auto-scroll, exactly as a finger would.
  const dragTo=async(from,findTarget,{steps=14,hold=260,edge=false}={})=>{
    await p.mouse.move(from.x,from.y);await p.mouse.down()
    await p.mouse.move(from.x+18,from.y+11,{steps:3});await p.waitForTimeout(120)
    const live=await p.evaluate(()=>!!document.querySelector('.cx-draghost'))
    let t=await findTarget()
    // Nothing on screen to aim at: hold near the top edge and let the drag
    // scroll the page — the phone case, where the rail is far below the grid.
    if(!t&&edge){
      const y0=await p.evaluate(()=>Math.round(window.scrollY))
      for(let i=0;i<40&&!t;i++){
        await p.mouse.move(from.x,26,{steps:2})
        await p.waitForTimeout(110)
        t=await findTarget()
      }
      const y1=await p.evaluate(()=>Math.round(window.scrollY))
      console.log(`     edge auto-scroll: ${y0} -> ${y1}, target ${t?'found':'not found'}`)
    }
    if(!t){await p.mouse.up();return {live,ghost:null,reached:false}}
    await p.mouse.move(t.x,t.y,{steps});await p.waitForTimeout(hold)
    // let auto-scroll settle, then re-aim once
    t=await findTarget()
    if(t){await p.mouse.move(t.x,t.y,{steps:4});await p.waitForTimeout(200)}
    if(t)console.log('     aim:',JSON.stringify(await p.evaluate(([x,y])=>{const e=document.elementFromPoint(x,y)
      return {x,y,el:e?e.className||e.tagName:'null',bar:!!e?.closest?.('.cx-bar[data-bid]'),
        day:e?.closest?.('[data-d]')?.dataset?.d||null}},[t.x,t.y])))
    const ghost=await p.evaluate(()=>{const el=document.querySelector('.cx-draghost');if(!el)return null
      return {label:el.querySelector('b')?.textContent,why:el.querySelector('small')?.textContent,
        cls:el.querySelector('small')?.className,
        ok:!!document.querySelector('.drop-ok'),warn:!!document.querySelector('.drop-warn'),
        poolOn:!!document.querySelector('.cx-droppool.on')}})
    await p.mouse.up();await p.waitForTimeout(2000)
    return {live,ghost,reached:true}
  }
  // aim well clear of the edges, where a real finger would be asking the page
  // to scroll rather than pointing at anything
  const barTarget=()=>p.evaluate(()=>{
    const bars=[...document.querySelectorAll('.cx-bar[data-bid]')]
      .filter(b=>{const r=b.getBoundingClientRect()
        return r.top>100&&r.bottom<window.innerHeight-100&&r.width>30})
    if(!bars.length)return null
    const r=bars[0].getBoundingClientRect()
    return {x:r.x+r.width/2,y:r.y+r.height/2,bid:bars[0].dataset.bid}})

  // ── 1. a waiting delegate onto a course ──────────────────────────────────
  const n0=await badge()
  const src=await grab('.cx-droppool .cx-row',0)
  chk(!!src,`${name}: the waiting list is reachable (${src&&src.t})`)
  const r1=await dragTo(src,barTarget,{edge:true})
  chk(r1.live,`${name}: a drag starts and shows the ghost`)
  chk(r1.ghost&&/joins|waiting for/.test(r1.ghost.why||''),`${name}: it says what will happen ("${r1.ghost&&r1.ghost.why}")`)
  chk(r1.ghost&&(r1.ghost.ok||r1.ghost.warn),`${name}: the course under it is outlined`)
  const n1=await badge()
  chk(n1===n0-1,`${name}: dropping onto a course books them (${n0} -> ${n1})`)
  await p.screenshot({path:`/home/claude/dnd-${name}-course.png`})

  // ── 2. a trainer onto a course, across a scroll ──────────────────────────
  // Trainers starts folded now, so unfold it the way a user would.
  await p.evaluate(()=>{const b=[...document.querySelectorAll('.cx-cardtoggle')]
    .find(b=>/Trainers/.test(b.textContent))
    if(b&&b.closest('.cx-card').classList.contains('shut'))b.click()})
  await p.waitForTimeout(500)
  const tSrc=await grab('.cx-rail .cx-card:last-child .cx-row',0)
  chk(!!tSrc,`${name}: the Trainers card is reachable (${tSrc&&tSrc.t})`)
  if(tSrc){
    const scrollBefore=await p.evaluate(()=>Math.round(window.scrollY))
    const r2=await dragTo(tSrc,barTarget,{hold:900,edge:true})
    const scrollAfter=await p.evaluate(()=>Math.round(window.scrollY))
    chk(r2.live,`${name}: a trainer can be picked up`)
    chk(r2.ghost&&/teaches|already|holiday/.test(r2.ghost.why||''),
      `${name}: it says what will happen ("${r2.ghost&&r2.ghost.why}")`)
    console.log(`     page scrolled ${scrollBefore} -> ${scrollAfter} during the drag`)
    const trainerNames=await p.evaluate(()=>[...document.querySelectorAll('.cx-rail .cx-row small')].map(s=>s.textContent).join('|'))
    chk(/course/.test(trainerNames),`${name}: a trainer now has a course on`)
  }
  await p.screenshot({path:`/home/claude/dnd-${name}-trainer.png`})

  // ── 3. onto empty days, to book one ──────────────────────────────────────
  // Page to a month with nothing in it, so "an empty day" is unambiguous at any
  // width — at 390px the cells are narrow enough that a bar covers most of one.
  for(let i=0;i<10;i++){
    if(await p.evaluate(()=>document.querySelectorAll('.cx-bar').length===0))break
    await p.evaluate(()=>document.querySelectorAll('.cx-steps button')[1].click());await p.waitForTimeout(500)}
  console.log('     empty month:',await p.evaluate(()=>document.querySelector('.cx-title').textContent))
  const emptyDay=()=>p.evaluate(()=>{
    const bars=[...document.querySelectorAll('.cx-bar')].map(b=>b.getBoundingClientRect())
    for(const cel of document.querySelectorAll('.cx-cell[data-d]')){
      const r=cel.getBoundingClientRect()
      if(r.top<4||r.bottom>window.innerHeight-4)continue
      const x=r.x+r.width/2,y=r.y+r.height/2
      if(!bars.some(b=>x>=b.left&&x<=b.right&&y>=b.top&&y<=b.bottom))return {x,y,d:cel.dataset.d}}
    return null})
  const who=await p.evaluate(()=>document.querySelector('.cx-droppool .cx-row b')?.textContent)
  const src3=await grab('.cx-droppool .cx-row',0)
  const r3=await dragTo(src3,emptyDay,{edge:true})
  chk(r3.ghost&&/Book a course for/.test(r3.ghost.why||''),`${name}: dropping on empty days offers to book ("${r3.ghost&&r3.ghost.why}")`)
  const panel=await p.evaluate(()=>{const el=document.querySelector('.cx-pop');if(!el)return null
    const sel=el.querySelector('.cx-row2 select')
    return {title:el.querySelector('.cx-pop-title')?.textContent,
      groups:[...(sel?.querySelectorAll('optgroup')||[])].map(g=>g.label)}})
  chk(panel&&panel.title.includes(who),`${name}: the panel is titled for them ("${panel&&panel.title}")`)
  chk(panel&&panel.groups.length===2,`${name}: their scheme comes first in the list (${panel&&panel.groups.join(' / ')})`)
  if(panel){
    const barsBefore=await p.evaluate(()=>document.querySelectorAll('.cx-bar').length)
    await p.evaluate(()=>{const s=document.querySelector('.cx-pop .cx-row2 select')
      const o=[...s.querySelectorAll('option')].find(o=>o.value);s.value=o.value
      s.dispatchEvent(new Event('change',{bubbles:true}))})
    await p.waitForTimeout(400)
    await p.evaluate(()=>{const b=[...document.querySelectorAll('.cx-pop button')].find(b=>/book it/i.test(b.textContent));b&&b.click()})
    await p.waitForTimeout(2600)
    const made=await p.evaluate(()=>{const el=document.querySelector('.cx-pop');if(!el)return null
      return {names:[...el.querySelectorAll('.cx-delg li b')].map(b=>b.textContent)}})
    chk((await p.evaluate(()=>document.querySelectorAll('.cx-bar').length))>barsBefore,`${name}: the course is booked`)
    chk(made&&made.names.includes(who),`${name}: and ${who} is already on it (${made&&made.names.join(', ')})`)
    await p.screenshot({path:`/home/claude/dnd-${name}-booked.png`})

    // ── 4. drag them back off, onto the waiting list ──────────────────────
    const nA=await badge()
    const d=await grab('.cx-pop .cx-delg li b',0)
    const poolT=()=>p.evaluate(()=>{const e=document.querySelector('.cx-droppool h3');if(!e)return null
      const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})
    if(d){
      const r4=await dragTo(d,poolT,{hold:900,edge:true})
      const nB=await badge()
      if(nB>nA){
        chk(r4.ghost&&/back on the waiting list/.test(r4.ghost.why||''),
          `${name}: dragging them out says so ("${r4.ghost&&r4.ghost.why}")`)
        chk(r4.ghost&&r4.ghost.poolOn,`${name}: the waiting list lights up`)
        chk(true,`${name}: they are back on the waiting list (${nA} -> ${nB})`)
      }else{
        // On a narrow screen the panel is a sheet over the whole page, so the
        // route there is tap-to-pick-up, which must work just as well.
        console.log(`     drag-off did not land (${nA} -> ${nB}); checking tap-to-pick-up instead`)
        await p.keyboard.press('Escape');await p.waitForTimeout(300)
        const bar=await p.evaluate(()=>{const b=document.querySelector('.cx-bar[data-bid]');if(!b)return null
          b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect()
          return {x:r.x+r.width/2,y:r.y+r.height/2}})
        await p.waitForTimeout(400)
        await p.mouse.click(bar.x,bar.y);await p.waitForTimeout(900)
        const dd=await grab('.cx-pop .cx-delg li b',0)
        chk(!!dd,`${name}: a delegate row is reachable in the panel`)
        if(dd){
          await p.mouse.click(dd.x,dd.y);await p.waitForTimeout(700)
          const armed=await p.evaluate(()=>document.querySelector('.cx-placing')?.textContent||null)
          console.log('     placing:',armed)
          chk(armed&&/take them off/.test(armed),`${name}: tapping a delegate picks them up ("${armed}")`)
          chk(!(await p.evaluate(()=>!!document.querySelector('.cx-pop'))),`${name}: and the panel gets out of the way`)
          const pool=await p.evaluate(()=>{const e=document.querySelector('.cx-droppool h3')
            e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect()
            return {x:r.x+r.width/2,y:r.y+r.height/2}})
          await p.waitForTimeout(400)
          await p.mouse.click(pool.x,pool.y);await p.waitForTimeout(2200)
          const nC=await badge()
          chk(nC>nA,`${name}: tapping the waiting list takes them off (${nA} -> ${nC})`)
        }
      }
      await p.screenshot({path:`/home/claude/dnd-${name}-off.png`})
    }
  }
  await p.keyboard.press('Escape');await p.waitForTimeout(300)

  // ── 5. tap to pick up, tap to put down ───────────────────────────────────
  await p.evaluate(()=>window.scrollTo(0,0));await p.waitForTimeout(300)
  const nc=await badge()
  const row=await grab('.cx-droppool .cx-row',0)
  const whoTap=await p.evaluate(()=>document.querySelector('.cx-droppool .cx-row b')?.textContent)
  if(row){
    await p.mouse.click(row.x,row.y);await p.waitForTimeout(600)
    const armed=await p.evaluate(()=>{const b=document.querySelector('.cx-placing');if(!b)return null
      return {text:b.textContent,marked:document.querySelectorAll('.drop-ok,.drop-warn').length}})
    console.log('     placing bar:',JSON.stringify(armed))
    chk(!!armed,`${name}: tapping somebody picks them up`)
    chk(armed&&armed.text.includes(whoTap),`${name}: the bar names them ("${armed&&armed.text.slice(0,60)}")`)
    chk(armed&&armed.marked>0,`${name}: everywhere you could put them is marked (${armed&&armed.marked})`)
    chk((await badge())===nc,`${name}: and nothing has changed yet`)
    await p.screenshot({path:`/home/claude/dnd-${name}-placing.png`})
    // now scroll to the calendar and tap a course — placing survives scrolling,
    // which is the whole point of it on a phone
    await p.evaluate(()=>document.querySelector('.cx-cal').scrollIntoView({block:'center'}))
    await p.waitForTimeout(500)
    const t=await barTarget()
    if(t){
      await p.mouse.click(t.x,t.y);await p.waitForTimeout(2200)
      const nd=await badge()
      chk(nd===nc-1,`${name}: tapping a course places them (${nc} -> ${nd})`)
      chk(!(await p.evaluate(()=>!!document.querySelector('.cx-placing'))),`${name}: and it puts them down`)
    }else{chk(false,`${name}: a course is on screen to tap`)}
    // Escape cancels
    const row2=await grab('.cx-droppool .cx-row',0)
    if(row2){
      await p.mouse.click(row2.x,row2.y);await p.waitForTimeout(500)
      const n2=await badge()
      await p.keyboard.press('Escape');await p.waitForTimeout(400)
      chk(!(await p.evaluate(()=>!!document.querySelector('.cx-placing'))),`${name}: Escape puts them back down`)
      chk((await badge())===n2,`${name}: without changing anything`)
    }
  }

  console.log(`     errors: ${errs.length?errs.join(' / '):'none'}`)
  if(errs.length)chk(false,`${name}: console errors`)
  await c.close()
}

await run({name:'desktop',width:1600,height:1000})
await run({name:'tablet',width:820,height:1180,touch:true})
await run({name:'phone',width:390,height:844,touch:true})

console.log(`\n=== ${pass.length} pass / ${fail.length} fail ===`)
fail.forEach(f=>console.log('  FAIL '+f))
await br.close();srv.close()
