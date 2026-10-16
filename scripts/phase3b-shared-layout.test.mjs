import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedLayoutStyle,validateSharedLayout} from '../apps/web/src/sharedLayoutMetadata.ts';
test('3b reuses existing grid viewport columns',()=>{
 const def={kind:'Grid',visualStyle:{desktopColumns:4,tabletColumns:2,mobileColumns:1}};
 assert.equal(sharedLayoutStyle(def,'Desktop').gridTemplateColumns,'repeat(4, minmax(0, 1fr))');
 assert.equal(sharedLayoutStyle(def,'Tablet').gridTemplateColumns,'repeat(2, minmax(0, 1fr))');
 assert.equal(sharedLayoutStyle(def,'Phone').gridTemplateColumns,'repeat(1, minmax(0, 1fr))');
});
test('3b nested slots validate without per-app hardcoding',()=>{
 assert.deepEqual(validateSharedLayout({kind:'Column',slotNames:['header','body']}),[]);
 assert.ok(validateSharedLayout({kind:'Row',slotNames:['body','body']}).length);
 assert.ok(validateSharedLayout({kind:'unknown'}).length);
});
