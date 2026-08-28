import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { extname, join } from 'path'
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'}
const srv=createServer((q,r)=>{let p=join('/tmp/sgastest/dist',decodeURIComponent(q.url.split('?')[0]))
 if(!existsSync(p)||p.endsWith('/'))p='/tmp/sgastest/dist/index.html'
 r.writeHead(200,{'Content-Type':T[extname(p)]||'application/octet-stream'});r.end(readFileSync(p))}).listen(4250)
const br=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'})
const pass=[],fail=[]
const chk=(ok,m)=>{(ok?pass:fail).push(m);console.log((ok?'PASS  ':'FAIL  ')+m)}

async function run({name,width,height,touch}){
 console.log(`\n──────── ${name} (${width}×${height}) ────────`)
 const c=await br.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:!!touch})
 const p=await c.newPage()
 const errs=[];p.on('pageerror',e=>errs.push(String(e)))
 p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text())})
 p.on('dialog',d=>d.accept())
 await p.goto('http://localhost:4250',{waitUntil:'networkidle'});await p.waitForTimeout(400)
 await p.locator('input[type=text]').first().fill('admin');await p.locator('input[type=password]').first().fill('demo')
 await p.locator('button').first().click();await p.waitForTimeout(1400)
 await p.evaluate(()=>{const x=[...document.querySelectorAll('.nav button')].find(e=>e.textContent.includes('new look'));x&&x.click()})
 await p.waitForTimeout(1500)
 if(!(await p.evaluate(()=>{const r=document.querySelector('.cx-rail');return r&&getComputedStyle(r).display!=='none'})))
   {await p.locator('.cx-railbtn').click();await p.waitForTimeout(600)}
 for(let i=0;i<8;i++){if(await p.evaluate(()=>document.querySelectorAll('.cx-bar').length>=2))break
   await p.evaluate(()=>document.querySelectorAll('.cx-steps button')[0].click());await p.waitForTimeout(600)}

 const cards=()=>p.evaluate(()=>[...document.querySelectorAll('.cx-rail .cx-card')].map(c=>({
   title:c.querySelector('.cx-cardtoggle')?.textContent.trim(),
   count:c.querySelector('h3 > span')?.textContent,
   open:!c.classList.contains('shut'),
   expanded:c.querySelector('.cx-cardtoggle')?.getAttribute('aria-expanded'),
   rows:c.querySelectorAll('.cx-row').length,
   h:Math.round(c.getBoundingClientRect().height)})))
 const railH=()=>p.evaluate(()=>Math.round(document.querySelector('.cx-rail').getBoundingClientRect().height))

 const c0=await cards()
 console.log('  ',JSON.stringify(c0))
 chk(c0.length>=3,`${name}: the rail has cards (${c0.length})`)
 chk(c0.every(c=>c.expanded!==null),`${name}: every card header is a real toggle`)
 const trainers=c0.find(c=>c.title==='Trainers')
 chk(trainers&&!trainers.open,`${name}: Trainers starts folded — the one you reach for least`)
 chk(c0.every(c=>c.count&&c.count.trim()),`${name}: every card shows its count`)

 // fold them all and watch the rail shrink
 const h0=await railH()
 await p.evaluate(()=>[...document.querySelectorAll('.cx-cardtoggle')].forEach(b=>{
   if(!b.closest('.cx-card').classList.contains('shut'))b.click()}))
 await p.waitForTimeout(500)
 const h1=await railH()
 const c1=await cards()
 console.log(`   rail ${h0} -> ${h1}px`)
 chk(c1.every(c=>!c.open),`${name}: they all fold`)
 chk(h1<h0*0.5,`${name}: the rail gets a lot shorter (${h0} -> ${h1}px)`)
 chk(c1.every(c=>c.count&&c.count.trim()),`${name}: folded, they still show their counts`)
 chk(c1.every(c=>c.rows===0),`${name}: and their contents are gone, not just hidden`)
 await p.screenshot({path:`/home/claude/cards-${name}-shut.png`})

 // remembered across a reload
 await p.reload({waitUntil:'networkidle'});await p.waitForTimeout(1500)
 if(await p.evaluate(()=>!!document.querySelector('input[type=password]'))){
   await p.locator('input[type=text]').first().fill('admin');await p.locator('input[type=password]').first().fill('demo')
   await p.locator('button').first().click();await p.waitForTimeout(1400)}
 // a reload lands back on the default screen — go to the calendar again
 await p.evaluate(()=>{const x=[...document.querySelectorAll('.nav button')].find(e=>e.textContent.includes('new look'));x&&x.click()})
 await p.waitForTimeout(1600)
 if(!(await p.evaluate(()=>{const r=document.querySelector('.cx-rail');return r&&getComputedStyle(r).display!=='none'})))
   {await p.locator('.cx-railbtn').click();await p.waitForTimeout(600)}
 const back=await cards()
 console.log('   after reload:',JSON.stringify(back.map(c=>[c.title,c.open])))
 chk(back.length>=3,`${name}: the rail is back after a reload (${back.length} cards)`)
 chk(back.length>0&&back.every(c=>!c.open),`${name}: it remembers which were folded`)

 // back to a month that has courses in it
 for(let i=0;i<10;i++){if(await p.evaluate(()=>document.querySelectorAll('.cx-bar').length>=1))break
   await p.evaluate(()=>document.querySelectorAll('.cx-steps button')[0].click());await p.waitForTimeout(600)}
 // a folded waiting list is still a drop target — it springs open
 await p.evaluate(()=>{const b=[...document.querySelectorAll('.cx-cardtoggle')]
   .find(b=>/Waiting/.test(b.textContent));if(b&&!b.closest('.cx-card').classList.contains('shut'))b.click()})
 await p.waitForTimeout(300)
 const poolShut=await p.evaluate(()=>document.querySelector('.cx-droppool').classList.contains('shut'))
 chk(poolShut,`${name}: the waiting list is folded to start with`)
 // open a course, pick a delegate up by tapping
 const bar=await p.evaluate(()=>{const b=[...document.querySelectorAll('.cx-bar[data-bid]')]
   .find(b=>b.getBoundingClientRect().width>40);if(!b)return null
   b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect()
   return {x:r.x+r.width/2,y:r.y+r.height/2}})
 if(bar){
   await p.waitForTimeout(400)
   await p.mouse.click(bar.x,bar.y);await p.waitForTimeout(900)
   const d=await p.evaluate(()=>{const e=document.querySelector('.cx-pop .cx-delg li b');if(!e)return null
     const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})
   if(d){
     await p.mouse.click(d.x,d.y);await p.waitForTimeout(700)
     const sprung=await p.evaluate(()=>{const c=document.querySelector('.cx-droppool')
       return {shut:c.classList.contains('shut'),armed:c.classList.contains('armed'),
         placing:!!document.querySelector('.cx-placing')}})
     console.log('   after picking a delegate up:',JSON.stringify(sprung))
     chk(sprung.placing,`${name}: tapping a delegate picks them up`)
     chk(!sprung.shut,`${name}: and the folded waiting list springs open to catch them`)
     await p.screenshot({path:`/home/claude/cards-${name}-spring.png`})
     await p.keyboard.press('Escape');await p.waitForTimeout(300)
   }else{chk(false,`${name}: a delegate row is there to tap`)}
 }else{chk(false,`${name}: a course is on screen`)}
 console.log('   errors:',errs.length?errs.join(' / '):'none')
 if(errs.length)chk(false,`${name}: console errors`)
 await c.close()
}
await run({name:'desktop',width:1600,height:1000})
await run({name:'phone',width:390,height:844,touch:true})
console.log(`\n=== ${pass.length} pass / ${fail.length} fail ===`)
fail.forEach(f=>console.log('  FAIL '+f))
await br.close();srv.close()
