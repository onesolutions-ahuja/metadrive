/** Shared Flow Assignment behaviour. Business constraints live in metadata-driven
 * Decisions, Object queries and tenant-authorised record mutations, not here. */
type Scalar=string|number|boolean|null;
type Resource={name:string;type?:string;isCollection?:boolean;dataType?:string};
type Config=Record<string,unknown>;
const identifier=/^[A-Za-z][A-Za-z0-9_]*$/;
const reference=/^(?:\{!([A-Za-z_$][A-Za-z0-9_$.]*)\}|@([A-Za-z_$][A-Za-z0-9_$.]*))$/;
const scalar=(value:unknown):value is Scalar=>value===null
  ||typeof value==='string'||typeof value==='boolean'
  ||typeof value==='number'&&Number.isFinite(value);

function safeRecord(row:unknown):Record<string,Scalar> {
  if(!row||typeof row!=='object'||Array.isArray(row))throw new Error('Assignment requires record values');
  const entries=Object.entries(row);
  if(entries.length>100||entries.some(([key,value])=>!identifier.test(key)||!scalar(value)))
    throw new Error('Assignment record contains invalid fields');
  return Object.fromEntries(entries) as Record<string,Scalar>;
}
function safeCollection(input:unknown):Array<Record<string,Scalar>> {
  if(!Array.isArray(input)||input.length>200)
    throw new Error('Assignment record collection must contain at most 200 records');
  return input.map(safeRecord);
}
const bounded=(value:number)=>{
  if(!Number.isFinite(value))throw new Error('Assignment arithmetic is not finite');
  return value;
};

/** Production execution and dry-run checking use the same typed operator rules. */
export function applyFlowAssignment(context:{
  config:Config;vars:Record<string,unknown>;resources:Resource[];
  resolveReference:(reference:string)=>unknown;
  evaluateScalar:(expression:unknown)=>unknown;
  setScalar:(name:unknown,value:Scalar)=>void;
}):void {
  const {config,vars,resources,resolveReference,evaluateScalar,setScalar}=context;
  const target=config.variable;
  if(typeof target!=='string'||!(identifier.test(target)||/^\$Record\.[A-Za-z][A-Za-z0-9_]*$/.test(target)))
    throw new Error('Invalid Assignment target');
  const operation=String(config.operator??'Assign');
  const definition=resources.find(item=>item.name===target);
  const recordTarget=target.startsWith('$Record.');
  const isCollection=definition?.type==='Record Collection'||definition?.isCollection===true;
  const expression=config.value??null;
  const resolve=():unknown=>{
    if(typeof expression==='string'){
      const found=reference.exec(expression);
      if(found)return resolveReference(found[1]??found[2]);
    }
    return evaluateScalar(expression);
  };
  if(isCollection) {
    if(!['Assign','Add','Add At Beginning','Add At End','Remove','Remove All'].includes(operation))
      throw new Error('Unsupported record collection Assignment operator: '+operation);
    if(operation==='Remove All'){vars[target]=[];return;}
    const value=resolve();
    if(operation==='Assign'){vars[target]=safeCollection(value);return;}
    const existing=vars[target]??[];
    const rows=safeCollection(existing);
    if(operation==='Remove'){
      const removed=Array.isArray(value)?safeCollection(value):[safeRecord(value)];
      const ids=new Set(removed.map(row=>row.Id));
      if(ids.has(undefined)||ids.has(null)||ids.has(''))throw new Error('Removing records requires record IDs');
      vars[target]=rows.filter(row=>!ids.has(row.Id));
      return;
    }
    const items=Array.isArray(value)?safeCollection(value):[safeRecord(value)];
    if(rows.length+items.length>200)throw new Error('Assignment record collection exceeds 200 records');
    vars[target]=operation==='Add At Beginning'?[...items,...rows]:[...rows,...items];
    return;
  }
  if(!['Assign','Add','Subtract','Multiply','Divide',
    'Add At Beginning','Add At End','Remove All'].includes(operation))
    throw new Error('Unsupported scalar Assignment operator: '+operation);
  if(operation==='Remove All'){
    if(recordTarget)throw new Error('Record fields cannot be cleared with Remove All');
    setScalar(target,null);return;
  }
  const operand=resolve();
  if(!scalar(operand))throw new Error('Scalar Assignment values must be text, number, boolean or null');
  if(operation==='Assign'){setScalar(target,operand);return;}
  if(recordTarget)throw new Error('Before-save Record fields only support Assign');
  const current=vars[target];
  if(['Add','Subtract','Multiply','Divide'].includes(operation)) {
    if(typeof current!=='number'||typeof operand!=='number')
      throw new Error('Arithmetic Assignments require numeric resources');
    if(operation==='Divide'&&operand===0)throw new Error('Assignment division by zero');
    const result=operation==='Add'?current+operand:operation==='Subtract'?current-operand:
      operation==='Multiply'?current*operand:current/operand;
    setScalar(target,bounded(result));return;
  }
  if(typeof current!=='string'||typeof operand!=='string')
    throw new Error('Text Assignments require text resources');
  setScalar(target,operation==='Add At Beginning'?operand+current:current+operand);
}
