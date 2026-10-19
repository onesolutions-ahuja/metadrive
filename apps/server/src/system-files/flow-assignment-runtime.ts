/** Pure Assignment semantics shared by production Flow and read-only debugger. */
const scalar=(value:unknown)=>value===null||typeof value==='string'
 ||typeof value==='number'&&Number.isFinite(value)||typeof value==='boolean';
const equal=(left:unknown,right:unknown)=>left===right||(
 left!==null&&right!==null&&typeof left==='object'&&typeof right==='object'
 &&!Array.isArray(left)&&!Array.isArray(right)
 &&Object.hasOwn(left,'Id')&&Object.hasOwn(right,'Id')
 &&(left as {Id:unknown}).Id===(right as {Id:unknown}).Id);
export const flowAssignmentOperators=[
 'Assign','Add','Subtract','Multiply','Divide','Add At Beginning','Add At End','Remove','Remove All'
] as const;
export function evaluateFlowAssignment(current:unknown,value:unknown,operator:string,
 collection:boolean):unknown {
 if(!flowAssignmentOperators.some(item=>item===operator))
  throw new Error('Unsupported Flow Assignment operator: '+operator);
 if(collection){
  const previous=current===undefined||current===null?[]:current;
  if(!Array.isArray(previous)||previous.length>200)
   throw new Error('Flow Assignment requires a record collection of at most 200 items');
  const values=Array.isArray(value)?value:[value];
  if(operator==='Assign'){
   if(!Array.isArray(value))throw new Error('Collection Assignment requires a collection value');
   if(value.length>200)throw new Error('Flow Assignment collection limit exceeded');
   return [...value];
  }
  if(['Add','Add At End','Add At Beginning'].includes(operator)){
   if(previous.length+values.length>200)throw new Error('Flow Assignment collection limit exceeded');
   return operator==='Add At Beginning'?[...values,...previous]:[...previous,...values];
  }
  if(operator==='Remove All')return value===undefined||value===null?[]:
   previous.filter(item=>!values.some(target=>equal(item,target)));
  if(operator==='Remove'){
   const next=[...previous];
   for(const target of values){
    const index=next.findIndex(item=>equal(item,target));
    if(index!==-1)next.splice(index,1);
   }
   return next;
  }
  throw new Error('Numeric Assignment operators cannot modify a collection');
 }
 if(!scalar(value))throw new Error('Scalar Assignment needs a scalar value');
 if(operator==='Assign')return value;
 if(['Add','Subtract','Multiply','Divide'].includes(operator)){
  if(typeof current==='number'&&typeof value==='number'){
   const result=operator==='Add'?current+value:operator==='Subtract'?current-value:
    operator==='Multiply'?current*value:current/value;
   if(!Number.isFinite(result))throw new Error('Invalid numeric Flow Assignment');
   return result;
  }
  if(operator==='Add'&&typeof current==='string'&&typeof value==='string')
   return current+value;
  throw new Error('Numeric Flow Assignment requires matching numeric resources');
 }
 if(operator==='Add At Beginning'||operator==='Add At End'){
  if(typeof value!=='string'||typeof current!=='string')
   throw new Error('Text Assignment requires text resources');
  const result=operator==='Add At Beginning'?value+current:current+value;
  if(result.length>8192)throw new Error('Text Assignment value is too long');
  return result;
 }
 if(operator==='Remove All'){
  if(typeof current!=='string'||typeof value!=='string')
   throw new Error('Remove All requires text resources');
  return value?current.replaceAll(value,''):current;
 }
 throw new Error('Remove is available only for collection Assignments');
}
