// Lossless state restoration from normalized rows; no database access or app-specific code.
import {platformSettingSections} from './platform-state-registry.mjs';
function fail(message) { throw new Error('MetaDrive relational projection: ' + message); }
function obj(value,path) {
  if (value===null || typeof value!=='object' || Array.isArray(value)) fail(path+' must be an object');
  return value;
}
function arr(value,path) {
  if (!Array.isArray(value)) fail(path+' must be an array');
  return value;
}
function define(object,key,value) {
  Object.defineProperty(object,key,{value,enumerable:true,writable:true,configurable:true});
}
export function restoreState(rows) {
  const tenants={};
  for(const {tenantId} of rows.tenants) {
    if(Object.hasOwn(tenants,tenantId)) fail('duplicate tenant '+tenantId);
    define(tenants,tenantId,{objects:[],records:{}});
  }
  function owner(tenantId) {
    if(!Object.hasOwn(tenants,tenantId)) fail('missing tenant '+tenantId);
    return tenants[tenantId];
  }
  for(const row of [...rows.objects].sort((a,b)=>a.position-b.position)) owner(row.tenantId).objects.push(row.payload);
  for(const row of rows.collections) {
    const t=owner(row.tenantId);
    if(Object.hasOwn(t,row.key)) fail('duplicate tenant collection '+row.tenantId+'/'+row.key);
    define(t,row.key,[]);
  }
  for(const row of [...rows.collectionItems].sort((a,b)=>a.position-b.position)) {
    const items=owner(row.tenantId)[row.key];
    if(!Array.isArray(items)) fail('collection missing '+row.tenantId+'/'+row.key);
    items.push(row.payload);
  }
  for(const row of rows.settings) {
    const t=owner(row.tenantId);
    if(Object.hasOwn(t,row.key)) fail('duplicate tenant setting '+row.tenantId+'/'+row.key);
    define(t,row.key,row.payload);
  }
  for(const row of rows.recordBuckets) {
    const buckets=owner(row.tenantId).records;
    if(Object.hasOwn(buckets,row.objectApiName)) fail('duplicate record bucket '+row.tenantId+'/'+row.objectApiName);
    define(buckets,row.objectApiName,[]);
  }
  for(const row of [...rows.records].sort((a,b)=>a.position-b.position)) {
    const buckets=owner(row.tenantId).records;
    if(!Object.hasOwn(buckets,row.objectApiName)) fail('record bucket missing '+row.tenantId+'/'+row.objectApiName);
    buckets[row.objectApiName].push(row.payload);
  }
  const users=[...rows.users].sort((a,b)=>a.position-b.position).map(({position,extra,...fields})=>({...fields,...extra}));
  const refreshSessions=[...rows.sessions].sort((a,b)=>a.position-b.position).map(({position,extra,...fields})=>({...fields,...extra}));
  const libraryComponents=[...rows.components].sort((a,b)=>a.position-b.position).map(r=>r.payload);
  const revokedAccessTokens=Object.fromEntries(rows.revokedTokens.map(r=>[r.tokenHash,r.expiresAt]));
  const restored={tenants,libraryComponents,users,refreshSessions,revokedAccessTokens};
  for (const row of rows.platformSettings ?? []) {
    if (!platformSettingSections.some(section=>section.key===row.key) || Object.hasOwn(restored,row.key))
      fail('unknown or duplicate platform setting ' + row.key);
    const section = platformSettingSections.find(section=>section.key===row.key);
    if (section.valueType==='array') arr(row.payload,row.key);
    else obj(row.payload,row.key);
    define(restored,row.key,row.payload);
  }
  return restored;
}
