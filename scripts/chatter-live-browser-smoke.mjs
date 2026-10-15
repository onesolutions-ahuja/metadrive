import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const email=process.env.METADRIVE_TEST_EMAIL,password=process.env.METADRIVE_TEST_PASSWORD;
if(!email||!password)throw Error('CI credentials required');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
try{
 const url='https://metadrive-production.up.railway.app/une/apps/Communication/pages/UNE_CHATTER';
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
 await page.locator('#login-email').waitFor({state:'visible',timeout:60000});
 await page.locator('#login-email').fill(email);
 await page.locator('#login-password').fill(password);
 await page.getByRole('button',{name:'Sign in'}).click();
 await page.locator('#login-email').waitFor({state:'hidden',timeout:60000});
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
 await page.locator('.md-chatter').waitFor({state:'visible',timeout:60000});
 await page.waitForFunction(()=>{const button=document.querySelector('.md-chatter-new');return button&&!button.disabled;},undefined,{timeout:80000});
 const account=page.getByRole('combobox',{name:'WhatsApp account'});
 const count=await account.locator('option').count();
 assert.ok(count>=2,'Expected at least one assigned account in dropdown');
 const button=page.getByRole('button',{name:/New Chat/});
 assert.equal(await button.isEnabled(),true,'New Chat must be enabled');
 await button.click();
 await page.getByText('New WhatsApp chat').waitFor({state:'visible',timeout:10000});
 assert.equal(await page.getByLabel('Customer phone number').isEnabled(),true);
 const sender=page.getByRole('combobox',{name:'Send from account'});
 assert.ok(await sender.locator('option').count()>=1);
 console.log('CHATTER_BROWSER_LIVE '+JSON.stringify({chatterRendered:true,assignedAccounts:count-1,newChatEnabled:true,composeVisible:true,sendFormAvailable:true,providerMessageSent:false}));
}finally{await browser.close()}
