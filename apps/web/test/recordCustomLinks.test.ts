import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveRecordCustomLink} from '../src/core/records/RecordWorkspace/recordCustomLinks';

const row={Id:'record-1',Name:'Acme & Co',Secret:'internal',Status:'Active'};
const readable=new Set(['Id','Name','Status']);

test('record links encode only readable values and keep HTTPS navigation safe',()=>{
 assert.equal(resolveRecordCustomLink('/records/{!Record.Id}?q={!Record.Name}',row,readable),
  '/records/record-1?q=Acme%20%26%20Co');
 assert.equal(resolveRecordCustomLink('https://example.com/find?q={!Record.Name}',row,readable),
  'https://example.com/find?q=Acme%20%26%20Co');
 assert.equal(resolveRecordCustomLink('/search/{!Record.Secret}',row,readable),null);
 assert.equal(resolveRecordCustomLink('/search/{!Record.Unknown}',row,readable),null);
});
test('record link templates reject unsafe URLs and unresolved expressions',()=>{
 for(const url of ['javascript:alert(1)','//evil.example.com','http://example.com',
  'https://example.com/{!NotSupported}','/\\evil.example.com','/\u0000unsafe']){
  assert.equal(resolveRecordCustomLink(url,row,readable),null);
 }
});
test('conditional links respect field access and record values',()=>{
 const template='/accounts/{!Record.Id}';
 assert.equal(resolveRecordCustomLink(template,row,readable,{field:'Status',value:'Active'}),'/accounts/record-1');
 assert.equal(resolveRecordCustomLink(template,row,readable,{field:'Status',value:'Closed'}),null);
 assert.equal(resolveRecordCustomLink(template,row,readable,{field:'Secret',value:'internal'}),null);
});
