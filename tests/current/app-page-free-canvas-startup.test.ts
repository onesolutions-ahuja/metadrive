import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPageSchema} from '../../apps/server/src/modules/pages/schemas.js';

const catalog=JSON.parse(readFileSync('apps/server/data/installable-app-packages.json','utf8'));
const whatsapp=catalog.packages.find((pkg:{appKey:string})=>pkg.appKey==='whatsapp');
const appPage=whatsapp.pages.find((page:{apiName:string})=>page.apiName==='UNE_CHATTER_APP');

test('published WhatsApp Chatter Free Canvas App Page survives tenant state hydration',()=>{
 assert.ok(appPage, 'Chatter App Page must exist');
 const result=createPageSchema().safeParse(appPage);
 assert.equal(result.success,true,JSON.stringify(result.success?null:result.error.issues));
 assert.equal(result.data?.pageType,'App Page');
 assert.equal(result.data?.layoutMode,'free-canvas');
});

test('Free Canvas still rejects record pages and non-library components',()=>{
 const schema=createPageSchema();
 assert.equal(schema.safeParse({...appPage,pageType:'Record Page',targetObject:'Communication_Records__c'}).success,false);
 assert.equal(schema.safeParse({...appPage,components:appPage.components.map((c:unknown,index:number)=>index===0?{...c as object,type:'Record Field'}:c)}).success,false);
});
