import { chromium } from 'playwright';
const base='https://onesolutions-ahuja.github.io/metadrive/';
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:640,height:800}});
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('input[type=email]').first().waitFor({state:'visible',timeout:110000});
  await page.locator('input[type=email]').fill(process.env.METADRIVE_TEST_EMAIL);
  await page.locator('input[type=password]').fill(process.env.METADRIVE_TEST_PASSWORD);
  await page.getByRole('button',{name:/^sign in$/i}).click();
  await page.locator('input[type=password]').first().waitFor({state:'hidden',timeout:45000});
  await page.goto(base+'une/setup/named-credentials',{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>!!document.querySelector('.named-credentials-page'),{timeout:30000});
  const diagnostic=await page.evaluate(()=>{
    const name=el=>(el.tagName.toLowerCase()+'.'+String(el.className||'').trim().replace(/\s+/g,'.')).slice(0,110);
    const list=[...document.querySelectorAll('body *')].map(el=>{
      const r=el.getBoundingClientRect(),s=getComputedStyle(el);
      return {el,n:name(el),right:Math.round(r.right),left:Math.round(r.left),width:Math.round(r.width),
        scroll:el.scrollWidth,client:el.clientWidth,overflow:s.overflowX,display:s.display,minWidth:s.minWidth,
        maxWidth:s.maxWidth,position:s.position};
    }).filter(e=>e.right>innerWidth+3&&e.width>1).sort((a,b)=>b.right-a.right).slice(0,24);
    const inspect=sel=>{const e=document.querySelector(sel);if(!e)return null;let nodes=[];for(let el=e;el&&nodes.length<6;el=el.parentElement){const r=el.getBoundingClientRect();const s=getComputedStyle(el);nodes.push({n:name(el),width:r.width,right:r.right,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,overflowX:s.overflowX,display:s.display,minWidth:s.minWidth,maxWidth:s.maxWidth});}return nodes;};
    return {innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyScrollWidth:document.body.scrollWidth,
      named:inspect('.named-credentials-page'),scroll:inspect('.named-credentials-page .table-scroll'),
      table:inspect('.named-credentials-page table'),offenders:list.map(({el,...other})=>other)};
  });
  console.log(JSON.stringify(diagnostic,null,2));
}finally{await browser.close();}
