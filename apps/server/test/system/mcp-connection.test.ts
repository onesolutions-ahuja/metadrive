import assert from 'node:assert/strict';
import {test} from 'node:test';
import express from 'express';
import {registerMcpRoutes} from '../../src/system-support/mcp-routes.js';
import {callMcpTool,mcpTools,type McpServices} from '../../src/system-support/mcp-tools.js';
import {validMcpResource} from '../../src/system-support/mcp-resource.js';
import {ConnectedAppService} from '../../src/system-support/connected-app-service.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {AuthenticationService} from '../../src/system-files/authentication.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
const actor={tenant_id:'tenant-a',user_id:'user-a'};
function services(scopes=['mcp:access','records:read']){
 const calls:unknown[][]=[];
 const s={
  db:{query:async(sql:string,args:unknown[])=>{calls.push([sql,...args]);return {rows:sql.startsWith('SELECT s.scope')?scopes.map(scope=>({scope})):[]};}},
  records:{list:async(...args:unknown[])=>{calls.push(['records',...args]);return {records:[{Id:'one'}]};}},
  rbac:{require:async()=>{},allowed:async()=>true},
  platform:{requirePlatform:async()=>{}},definitions:{list:async()=>[]},flows:{execute:async()=>({})}
 } as unknown as McpServices;
 return {s,calls};
}
async function server(scopes?:string[]){
 process.env.METADRIVE_MCP_ORIGIN='https://api.example.org';
 const app=express();app.use(express.json());
 const mock=services(scopes);
 registerMcpRoutes(app,mock.s,(req,res,next)=>{
  if(req.get('authorization')!=='Bearer valid'){res.status(401).json({error:'Invalid session'});return;}
  Object.assign(req,{actor});next();
 });
 const listener=app.listen(0,'127.0.0.1');await new Promise<void>(r=>listener.once('listening',r));
 const address=listener.address();if(!address||typeof address==='string')throw Error();
 const origin='http://127.0.0.1:'+address.port;
 return {...mock,origin,close:()=>new Promise<void>((r,j)=>{listener.close(e=>e?j(e):r());listener.closeAllConnections();}),
  rpc:async(method:string,args?:unknown)=>fetch(origin+'/api/mcp',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer valid'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:args})})};
}
test('MCP discovery has a fixed HTTPS audience and rejects invalid origins',()=>{
 process.env.METADRIVE_MCP_ORIGIN='https://api.example.org';
 assert.equal(validMcpResource('https://api.example.org/api/mcp'),true);
 assert.equal(validMcpResource('https://evil.example/api/mcp'),false);
 process.env.METADRIVE_MCP_ORIGIN='http://api.example.org';
 assert.throws(()=>validMcpResource('http://api.example.org/api/mcp'));
});
test('MCP requires authentication and a resource-bound OAuth grant',async()=>{
 const x=await server([]);try{
  const unauth=await fetch(x.origin+'/api/mcp');assert.equal(unauth.status,401);
  assert.match(unauth.headers.get('www-authenticate')??'',/oauth-protected-resource/);
  const response=await x.rpc('tools/list');assert.equal(response.status,401);
  const query=x.calls.find(c=>String(c[0]).startsWith('SELECT s.scope'))!;
  assert.equal(query.at(-1),'https://api.example.org/api/mcp');
 }finally{await x.close();}
});
test('tools are scope-filtered and attempted write without scope never reaches records',async()=>{
 const x=await server();try{
  const listed=await (await x.rpc('tools/list')).json();
  assert.deepEqual(listed.result.tools.map((t:{name:string})=>t.name),['list_records','get_record']);
  const rejected=await (await x.rpc('tools/call',{name:'delete_record',arguments:{object:'Contact',id:'123e4567-e89b-42d3-a456-426614174000'}})).json();
  assert.equal(rejected.result.isError,true);assert.equal(x.calls.some(c=>c[0]==='records'),false);
 }finally{await x.close();}
});
test('record calls use authenticated tenant and user, reject injected tenant arguments, and audit',async()=>{
 const x=await server();try{
  const ok=await (await x.rpc('tools/call',{name:'list_records',arguments:{object:'Contact',limit:10}})).json();
  assert.equal(ok.result.isError,undefined);
  assert.deepEqual(x.calls.find(c=>c[0]==='records')?.slice(0,5),['records','tenant-a','user-a','Contact',10]);
  assert.ok(x.calls.some(c=>c.includes('McpToolRequested')));
  assert.ok(x.calls.some(c=>c.includes('McpToolSucceeded')));
  const before=x.calls.filter(c=>c[0]==='records').length;
  const bad=await (await x.rpc('tools/call',{name:'list_records',arguments:{object:'Contact',tenant_id:'tenant-b'}})).json();
  assert.equal(bad.result.isError,true);assert.equal(x.calls.filter(c=>c[0]==='records').length,before);
 }finally{await x.close();}
});
test('stateless transport negotiates version, acknowledges notifications and rejects GET streams',async()=>{
 const x=await server();try{
  const result=await (await x.rpc('initialize',{protocolVersion:'future',clientInfo:{name:'test',version:'1'},capabilities:{}})).json();
  assert.equal(result.result.protocolVersion,'2025-06-18');
  const notification=await fetch(x.origin+'/api/mcp',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer valid'},body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})});assert.equal(notification.status,202);
  assert.equal((await fetch(x.origin+'/api/mcp',{headers:{Authorization:'Bearer valid'}})).status,405);
 }finally{await x.close();}
});
test('server operations enforce platform membership before executing any command',async()=>{
 const {s}=services();let rbacCalled=false;
 s.platform.requirePlatform=async()=>{throw Error('Platform permission denied');};
 s.rbac.require=async()=>{rbacCalled=true;};
 await assert.rejects(callMcpTool(s,actor,'server_operation',{action:'restart',service:'api'}),/Platform permission denied/);
 assert.equal(rbacCalled,false);
 await assert.rejects(callMcpTool(s,actor,'server_operation',{action:'restart',service:'api;id'}));
 await assert.rejects(callMcpTool(s,actor,'server_operation',{action:'activate_release',service:'api',release:'../../etc/passwd'}));
});
test('tool schemas describe real properties and reject additional properties',()=>{
 const schema=mcpTools.find(t=>t.name==='list_records')!.inputSchema as {properties?:unknown;additionalProperties?:boolean};
 assert.ok(schema.properties);assert.equal(schema.additionalProperties,false);
});
test('OAuth rejects a code exchange with the wrong resource before consuming code or issuing tokens',async()=>{
 let consumed=false,issued=false;
 const db={query:async()=>({rows:[{tenant_id:'tenant-a',id:'123e4567-e89b-42d3-a456-426614174000',client_type:'public'}]}),transaction:async(fn:(c:unknown)=>unknown)=>fn({query:async(sql:string)=>{
  if(sql.startsWith('UPDATE'))consumed=true;
  return {rows:[{consent_id:'consent',user_id:'user-a',resource:'https://api.example.org/api/mcp',redirect_uri:'https://client.example/callback',challenge:'wrong'}]};
 }})} as unknown as SqlPersistence;
 const auth={issuePasswordSession:async()=>{issued=true;}} as unknown as AuthenticationService;
 const s=new ConnectedAppService(db,auth,{} as RbacEngine);
 await assert.rejects(s.exchange({grant_type:'authorization_code',client_id:'123e4567-e89b-42d3-a456-426614174000',code:'a'.repeat(43),redirect_uri:'https://client.example/callback',code_verifier:'b'.repeat(43),resource:'https://evil.example/api/mcp'}),/Invalid OAuth grant/);
 assert.equal(consumed,false);assert.equal(issued,false);
});
