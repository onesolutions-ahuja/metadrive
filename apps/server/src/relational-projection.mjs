// Lossless metadata-driven projection of current MetaDrive state.
// Contains no database calls. Custom objects/fields are never hardcoded as SQL identifiers.
import { createHash } from 'node:crypto';

const rootKeys = new Set(['tenants', 'libraryComponents', 'users', 'refreshSessions', 'revokedAccessTokens']);
const userFields = ['id','tenantId','name','email','passwordSalt','passwordHash','role','permissionSetIds','permissionSetGroupIds','disabled','createdAt'];
const sessionFields = ['tokenHash','familyId','userId','tenantId','expiresAt','usedAt','revokedAt'];
function fail(message) { throw new Error('MetaDrive relational projection: ' + message); }
function obj(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path + ' must be an object');
  return value;
}
function arr(value, path) {
  if (!Array.isArray(value)) fail(path + ' must be an array');
  return value;
}
function name(value, path) {
  if (typeof value !== 'string' || !value.trim()) fail(path + ' must be a nonempty string');
  return value;
}
function define(object, key, value) {
  Object.defineProperty(object, key, { value, enumerable:true, writable:true, configurable:true });
}
function extras(value, fields) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !fields.includes(key)));
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
export function stateDigest(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
export function projectState(input) {
  const state = obj(input, 'state');
  for (const key of Object.keys(state)) if (!rootKeys.has(key)) fail('unknown top-level key: ' + key);
  const rows = {
    tenants:[], objects:[], collections:[], collectionItems:[], settings:[],
    recordBuckets:[], records:[], users:[], sessions:[], revokedTokens:[], components:[]
  };
  for (const [tenantId, tenantValue] of Object.entries(obj(state.tenants, 'tenants'))) {
    name(tenantId, 'tenant ID');
    rows.tenants.push({ tenantId });
    const tenant = obj(tenantValue, 'tenant ' + tenantId);
    for (const [key,value] of Object.entries(tenant)) {
      if (key === 'objects') {
        const seen = new Set();
        arr(value, tenantId + '.objects').forEach((metadata,position) => {
          const item = obj(metadata, tenantId + '.objects[' + position + ']');
          const apiName = name(item.apiName, 'object API name');
          if (seen.has(apiName)) fail('duplicate object ' + tenantId + '/' + apiName);
          seen.add(apiName);
          rows.objects.push({tenantId,apiName,position,payload:item});
        });
      } else if (key === 'records') {
        const buckets = obj(value, tenantId + '.records');
        Object.entries(buckets).forEach(([objectApiName,records],position) => {
          name(objectApiName, 'record object API name');
          rows.recordBuckets.push({tenantId,objectApiName,position});
          const seen = new Set();
          arr(records, tenantId + '.records.' + objectApiName).forEach((record,ordinal) => {
            const item = obj(record,'record');
            const id = name(item.Id, 'record Id');
            if (seen.has(id)) fail('duplicate record Id ' + tenantId + '/' + objectApiName + '/' + id);
            seen.add(id);
            rows.records.push({tenantId,objectApiName,id,position:ordinal,payload:item});
          });
        });
      } else if (Array.isArray(value)) {
        rows.collections.push({tenantId,key});
        value.forEach((payload,position) => rows.collectionItems.push({tenantId,key,position,payload}));
      } else {
        rows.settings.push({tenantId,key,payload:value});
      }
    }
  }
  arr(state.libraryComponents,'libraryComponents').forEach((payload,position)=>rows.components.push({position,payload}));
  const seenUsers=new Set(), seenEmails=new Set();
  arr(state.users,'users').forEach((value,position)=>{
    const item=obj(value,'users['+position+']');
    for(const key of userFields) if(!(key in item)) fail('missing users['+position+'].'+key);
    name(item.id,'user id'); name(item.tenantId,'user tenantId');
    if(seenUsers.has(item.id)) fail('duplicate user ID ' + item.id);
    seenUsers.add(item.id);
    const email=name(item.email,'user email').trim().toLowerCase();
    if(seenEmails.has(email)) fail('duplicate user email ' + email);
    seenEmails.add(email);
    rows.users.push({position,...Object.fromEntries(userFields.map(key=>[key,item[key]])),extra:extras(item,userFields)});
  });
  const seenSessions=new Set();
  arr(state.refreshSessions,'refreshSessions').forEach((value,position)=>{
    const item=obj(value,'refreshSessions['+position+']');
    for(const key of sessionFields) if(!(key in item)) fail('missing refreshSessions['+position+'].'+key);
    name(item.tokenHash,'session tokenHash');
    if(seenSessions.has(item.tokenHash)) fail('duplicate session tokenHash ' + item.tokenHash);
    seenSessions.add(item.tokenHash);
    rows.sessions.push({position,...Object.fromEntries(sessionFields.map(key=>[key,item[key]])),extra:extras(item,sessionFields)});
  });
  for(const [tokenHash,expiresAt] of Object.entries(obj(state.revokedAccessTokens,'revokedAccessTokens'))) {
    name(tokenHash,'revoked access token hash');
    if(typeof expiresAt!=='number'||!Number.isFinite(expiresAt)) fail('invalid revoked token expiry ' + tokenHash);
    rows.revokedTokens.push({tokenHash,expiresAt});
  }
  return rows;
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
  return {tenants,libraryComponents,users,refreshSessions,revokedAccessTokens};
}
export function verifyProjection(state, rows=projectState(state)) {
  const expected=stateDigest(state);
  const actual=stateDigest(restoreState(rows));
  if(actual!==expected) fail('round-trip mismatch: expected '+expected+' but reconstructed '+actual);
  return {digest:expected,counts:Object.fromEntries(Object.entries(rows).map(([key,value])=>[key,value.length]))};
}
