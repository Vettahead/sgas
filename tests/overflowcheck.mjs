import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { extname, join } from 'path'
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'}
const srv=createServer((q,r)=>{let p=join('/tmp/sgastest/dist',decodeURIComponent(q.url.split('?')[0]))
 if(!existsSync(p)||p.endsWith('/'))p='/tmp/sgastest/dist/index.html'
 r.writeHead(200,{'Content-Type':T[extname(p)]||'application/octet-stream'});r.end(readFileSync(p))}).listen(4260)
const br=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'})
const pass=[],fail=[]
const chk=(ok,m)=>{(ok?pass:fail).push(m);console.log((ok?'PASS  ':'FAIL  ')+m)}

for(const [nm,w,h] of [['desktop',1600,1000],['tablet',820,1180],['phone',390,844]]){
 console.log(`\n──────── ${nm} ────────`)
 const c=await br.newContext({viewport:{width:w,height:h},deviceScaleFactor:1});const p=await c.newPage()
 const errs=[];p.on('pageerror',e=>errs.push(String(e)))
 await p.goto('http://localhost:4260',{waitUntil:'networkidle'});await p.waitForTimeout(400)
 await p.locator('input[type=text]').first().fill('admin');await p.locator('input[type=password]').first().fill('demo')
 await p.locator('button').first().click();await p.waitForTimeout(1400)
 await p.evaluate(()=>{const x=[...document.querySelectorAll('.nav button')].find(e=>e.textContent.includes('new look'));x&&x.click()})
 await p.waitForTimeout(1500)
 const setView=async(v)=>{await p.evaluate(n=>{const g=document.querySelector('.cx-seg[aria-label="View"]')
   const b=[...g.querySelectorAll('button')].find(e=>e.textContent.trim()===n);b&&b.click()},v);await p.waitForTimeout(700)}
 for(let i=0;i<8;i++){if(await p.evaluate(()=>document.querySelectorAll('.cx-bar').length>=2))break
   await p.evaluate(()=>document.querySelectorAll('.cx-steps button')[0].click());await p.waitForTimeout(600)}

 for(const v of ['Month','Week','Day','Year']){
   await setView(v)
   // Nothing inside a course bar may paint outside the bar's own date span.
   // 2px of tolerance for sub-pixel rounding and border radius.
   const spills=await p.evaluate(()=>{
     const out=[]
     for(const bar of document.querySelectorAll('.cx-bar')){
       const b=bar.getBoundingClientRect()
       if(b.width<1)continue
       for(const kid of bar.querySelectorAll('*')){
         const k=kid.getBoundingClientRect()
         if(k.width<1&&k.height<1)continue
         const dl=b.left-k.left, dr=k.right-b.right, dt=b.top-k.top, db=k.bottom-b.bottom
         if(dl>2||dr>2||dt>2||db>2)out.push({
           bar:bar.textContent.trim().replace(/\s+/g,' ').slice(0,26),
           el:kid.className||kid.tagName,
           over:{left:Math.round(dl),right:Math.round(dr),top:Math.round(dt),bottom:Math.round(db)}})
       }
     }
     return out})
   const n=await p.evaluate(()=>document.querySelectorAll('.cx-bar').length)
   if(spills.length)console.log('   spills:',JSON.stringify(spills.slice(0,4)))
   chk(spills.length===0,`${nm} / ${v}: nothing paints outside its course bar (${n} bars, ${spills.length} spills)`)
 }
 // and in the year view specifically, a short bar simply has no text
 await setView('Year')
 const yr=await p.evaluate(()=>[...document.querySelectorAll('.cx-ybar')].map(b=>({
   w:Math.round(b.getBoundingClientRect().width),
   text:(b.querySelector('.cx-bar-t')?.textContent||'').trim(),
   textW:Math.round(b.querySelector('.cx-bar-t')?.getBoundingClientRect().width||0)})))
 console.log('   year bars:',JSON.stringify(yr))
 chk(yr.every(x=>x.textW<=x.w+2),`${nm}: every year label fits inside its own bar`)
 await p.screenshot({path:`/home/claude/spill-${nm}.png`})
 console.log('   errors:',errs.length?errs.join(' / '):'none')
 await c.close()
}
console.log(`\n=== ${pass.length} pass / ${fail.length} fail ===`)
fail.forEach(f=>console.log('  FAIL '+f))
await br.close();srv.close()
