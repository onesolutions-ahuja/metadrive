import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const base='https://onesolutions-ahuja.github.io/metadrive/';
const profiles=[['desktop',{width:1440,height:900}],['phone',{width:390,height:844}],['narrow',{width:640,height:800}]];
const browser=await chromium.launch({headless:true});
try {
 for(const [name,viewport] of profiles){
  const page=await browser.newPage({viewport});
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('input[type=email]').first().waitFor({state:'visible',timeout:110000});
  await page.locator('input[type=email]').fill(process.env.METADRIVE_TEST_EMAIL);
  await page.locator('input[type=password]').fill(process.env.METADRIVE_TEST_PASSWORD);
  await page.getByRole('button',{name:/^sign in$/i}).click();
  await page.locator('input[type=password]').first().waitFor({state:'hidden',timeout:45000});
  for(const [screen,route] of [['kiosk','une/setup/page-builder/UNE_KIOSK'],['settings','une/setup/home'],['credentials','une/setup/named-credentials']]){
    await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForFunction(()=>!!document.querySelector('.lightning'),{timeout:30000});
    await page.waitForTimeout(1600);
    const state=await page.evaluate(()=>{
      const content=document.querySelector('.named-credentials-page');
      const table=content?.querySelector('.table-scroll');
      const canvas=document.querySelector('.free-canvas-component');
      const header=document.querySelector('.builder-titlebar');
      const buttons=[...document.querySelectorAll('.setup-tree .tree-item')];
      return {viewport:innerWidth,rootWidth:document.documentElement.scrollWidth,
        tableOuter:table?.clientWidth??null,tableInner:table?.scrollWidth??null,
        scrollStyle:table?getComputedStyle(table).overflowX:null,
        canvasRole:canvas?.getAttribute('role')??null,
        paletteActions:document.querySelectorAll('.component-card-action').length,
        allMenuNamed:buttons.every(b=>Boolean(b.getAttribute('aria-label'))),
        headerWidth:header?.clientWidth??null, headerScroll:header?.scrollWidth??null};
    });
    const axe=await new AxeBuilder({page}).withRules(['nested-interactive','button-name','color-contrast','target-size','scrollable-region-focusable']).analyze();
    console.log(JSON.stringify({profile:name,screen,state,violations:axe.violations.map(v=>({id:v.id,nodes:v.nodes.length,targets:v.nodes.slice(0,2).map(x=>x.target)}))}));
  }
  await page.close();
 }
}finally{await browser.close();}
