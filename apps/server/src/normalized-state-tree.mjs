// Generic, lossless mapping for nested metadata, Flows, permissions, configurations,
// user/session state, and record snapshots into PostgreSQL typed scalar rows.
// No user-defined keys are interpreted as SQL identifiers; no JSONB is used.
// This is a compatibility representation. Dedicated object tables remain the
// intended source for physical business records after final runtime integration.
import {stateDigest} from './relational-projection.mjs';

const has=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
function assertJson(value) {
  const serialized=JSON.stringify(value);
  if(typeof serialized!=='string') throw Error('State is not a JSON document');
  return JSON.parse(serialized);
}

// The typed SQL queue has already JSON.parse'd its snapshot. Direct callers
// retain the original JSON-normalization behaviour unless they opt in.
export function projectNormalizedTree(source,alreadyNormalized=false) {
  const state=alreadyNormalized?source:assertJson(source);
  const nodes=[];
  let nextId=0;
  function visit(value,parentId,slotKey,ordinal) {
    const nodeId=++nextId;
    const kind=value===null?'null':Array.isArray(value)?'array':typeof value==='object'?'object':typeof value;
    if(!['null','array','object','string','number','boolean'].includes(kind))
      throw Error('Unsupported normalized state value');
    if(kind==='number'&&!Number.isFinite(value)) throw Error('Non-finite state number');
    const row={nodeId,parentId,slotKey,ordinal,kind,
      stringValue:kind==='string'?value:null,
      numberValue:kind==='number'?value:null,
      boolValue:kind==='boolean'?value:null};
    nodes.push(row);
    if(kind==='array') value.forEach((v,i)=>visit(v,nodeId,null,i));
    if(kind==='object') Object.entries(value).forEach(([key,v],i)=>visit(v,nodeId,key,i));
  }
  visit(state,null,null,0);
  return {nodes,digest:stateDigest(state)};
}

export function restoreNormalizedTree(nodes) {
  if(!Array.isArray(nodes)||nodes.length===0) throw Error('Normalized tree is empty');
  const byId=new Map(),children=new Map();
  for(const row of nodes) {
    const id=Number(row.nodeId??row.node_id);
    const parentId=row.parentId??row.parent_id;
    const parent=parentId===null||parentId===undefined?null:Number(parentId);
    if(!Number.isSafeInteger(id)||id<1||byId.has(id)) throw Error('Duplicate or invalid node identity');
    const normalized={nodeId:id,parentId:parent,slotKey:row.slotKey??row.slot_key??null,
      ordinal:Number(row.ordinal),kind:row.kind,
      stringValue:row.stringValue??row.string_value??null,
      numberValue:row.numberValue??row.number_value??null,
      boolValue:row.boolValue??row.bool_value??null};
    if(!Number.isSafeInteger(normalized.ordinal)||normalized.ordinal<0) throw Error('Invalid node order');
    byId.set(id,normalized);
    if(parent!==null) {
      if(!children.has(parent)) children.set(parent,[]);
      children.get(parent).push(normalized);
    }
  }
  const roots=[...byId.values()].filter(x=>x.parentId===null);
  if(roots.length!==1) throw Error('Normalized state must have exactly one root');
  const visited=new Set();
  function restore(row) {
    if(visited.has(row.nodeId)) throw Error('Cycle or shared child in state tree');
    visited.add(row.nodeId);
    const items=[...(children.get(row.nodeId)??[])].sort((a,b)=>a.ordinal-b.ordinal);
    if(row.kind==='object'||row.kind==='array') {
      const output=row.kind==='array'?[]:{};
      let position=0;
      const names=new Set();
      for(const item of items) {
        if(item.ordinal!==position++) throw Error('Noncontiguous node position');
        if(row.kind==='array') {
          if(item.slotKey!==null) throw Error('Array child has object key');
          output.push(restore(item));
        } else {
          if(typeof item.slotKey!=='string'||names.has(item.slotKey)) throw Error('Duplicate or missing object key');
          names.add(item.slotKey);
          Object.defineProperty(output,item.slotKey,{value:restore(item),enumerable:true,writable:true,configurable:true});
        }
      }
      return output;
    }
    if(items.length) throw Error('Scalar node has children');
    if(row.kind==='null') return null;
    if(row.kind==='string') return row.stringValue;
    if(row.kind==='number') {
      const value=Number(row.numberValue);
      if(row.numberValue===null||!Number.isFinite(value)) throw Error('Invalid scalar number');
      return value;
    }
    if(row.kind==='boolean') {
      if(typeof row.boolValue!=='boolean') throw Error('Invalid scalar boolean');
      return row.boolValue;
    }
    throw Error('Unknown state node type');
  }
  const state=restore(roots[0]);
  if(visited.size!==nodes.length) throw Error('Orphaned nodes in normalized state');
  return state;
}

export function verifyNormalizedTree(source,nodes=projectNormalizedTree(source).nodes) {
  const digest=stateDigest(source);
  if(stateDigest(restoreNormalizedTree(nodes))!==digest)
    throw Error('Normalized tree differs from source state');
  return {digest,count:nodes.length};
}
