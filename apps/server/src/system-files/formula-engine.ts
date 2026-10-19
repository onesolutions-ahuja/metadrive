import type {SqlPersistence} from './sql-persistence.js';
type Value=string|number|boolean|null;
type Node={kind:'literal';value:Value}|{kind:'field';name:string}|
 {kind:'unary';op:string;child:Node}|{kind:'binary';op:string;left:Node;right:Node}|
 {kind:'call';name:string;args:Node[]};
const precedence:Record<string,number>={'||':1,'&&':2,'==':3,'!=':3,
 '>':4,'<':4,'>=':4,'<=':4,'+':5,'-':5,'*':6,'/':6};
const supportedTypes=new Set(['Number','Currency','Percent','Checkbox','Text']);
const operators=new Set([...Object.keys(precedence),'!']);
export class FormulaEngine{
 constructor(private readonly db:SqlPersistence){}
 parse(expression:string):Node{
  if(typeof expression!=='string'||!expression.trim()||expression.length>2048)
   throw Error('Invalid formula expression');
  const tokens:string[]=[];
  const lex=/\s+|(?:\d+(?:\.\d+)?)|(?:[A-Za-z][A-Za-z0-9_]*)|(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(?:>=|<=|==|!=|&&|\|\|)|[+\-*/(),!<>]/y;
  let i=0;
  while(i<expression.length){
   lex.lastIndex=i;const match=lex.exec(expression);
   if(!match)throw Error('Unsupported formula syntax');
   if(!/^\s+$/.test(match[0]))tokens.push(match[0]);
   i=lex.lastIndex;
   if(tokens.length>200)throw Error('Formula complexity limit exceeded');
  }
  let index=0;
  const take=()=>tokens[index++];
  const peek=()=>tokens[index];
  const parseExpr=(min=0,depth=0):Node=>{
   if(depth>24)throw Error('Formula nesting limit exceeded');
   const token=take();
   if(!token)throw Error('Invalid formula expression');
   let node:Node;
   if(token==='('){
    node=parseExpr(0,depth+1);
    if(take()!==')')throw Error('Unclosed formula expression');
   }else if(token==='-'||token==='+'||token==='!'){
    node={kind:'unary',op:token,child:parseExpr(7,depth+1)};
   }else if(/^\d/.test(token)){
    node={kind:'literal',value:Number(token)};
   }else if(token.startsWith('"')||token.startsWith("'")){
    // Backslash escapes are deliberately limited to quoted delimiters and backslash.
    const raw=token.slice(1,-1);
    if(/\\(?!["'\\])/.test(raw))throw Error('Invalid formula text escape');
    node={kind:'literal',value:raw.replace(/\\(["'\\])/g,'$1')};
   }else if(/^[A-Za-z][A-Za-z0-9_]*$/.test(token)){
    const upper=token.toUpperCase();
    if(upper==='TRUE'||upper==='FALSE')node={kind:'literal',value:upper==='TRUE'};
    else if(peek()==='('){
     take();const args:Node[]=[];
     if(peek()!==')')for(;;){
      if(args.length>=12)throw Error('Too many formula arguments');
      args.push(parseExpr(0,depth+1));
      if(peek()!==',')break;take();
     }
     if(take()!==')')throw Error('Invalid formula function');
     if(!['IF','ABS','ROUND','CONCAT','LEN','UPPER','LOWER','ISBLANK'].includes(upper))
      throw Error('Unsupported formula function');
     node={kind:'call',name:upper,args};
    }else node={kind:'field',name:token};
   }else throw Error('Invalid formula operand');
   while(operators.has(peek())&&precedence[peek()]!==undefined&&precedence[peek()]>=min){
    const op=take();node={kind:'binary',op,left:node,right:parseExpr(precedence[op]+1,depth+1)};
   }
   return node;
  };
  const result=parseExpr();
  if(index!==tokens.length)throw Error('Unexpected formula token');
  return result;
 }
 references(node:Node):string[]{
  const found=new Set<string>();
  const visit=(n:Node):void=>{
   if(n.kind==='field')found.add(n.name);
   if(n.kind==='unary')visit(n.child);
   if(n.kind==='binary'){visit(n.left);visit(n.right);}
   if(n.kind==='call')n.args.forEach(visit);
  };
  visit(node);return [...found];
 }
 evaluate(node:Node,record:Record<string,unknown>):Value{
  const number=(x:Value)=>{const n=Number(x??0);if(!Number.isFinite(n))throw Error('Invalid formula numeric input');return n;};
  const value=(x:Node):Value=>this.evaluate(x,record);
  if(node.kind==='literal')return node.value;
  if(node.kind==='field'){
   const raw=record[node.name];
   if(raw===undefined||raw===null)return null;
   if(typeof raw==='string'||typeof raw==='number'||typeof raw==='boolean')return raw;
   throw Error('Invalid formula input');
  }
  if(node.kind==='unary'){
   const x=value(node.child);
   return node.op==='!'?!Boolean(x):node.op==='-'?-number(x):number(x);
  }
  if(node.kind==='binary'){
   const a=value(node.left),b=value(node.right);
   switch(node.op){
    case '||':return Boolean(a)||Boolean(b);
    case '&&':return Boolean(a)&&Boolean(b);
    case '==':return a===b;
    case '!=':return a!==b;
    case '>':return number(a)>number(b);
    case '<':return number(a)<number(b);
    case '>=':return number(a)>=number(b);
    case '<=':return number(a)<=number(b);
    case '+':return typeof a==='string'||typeof b==='string'?String(a??'')+String(b??''):number(a)+number(b);
    case '-':return number(a)-number(b);
    case '*':return number(a)*number(b);
    case '/':if(number(b)===0)throw Error('Division by zero');return number(a)/number(b);
   }
  }
  if(node.kind==='call'){
   const args=node.args;
   switch(node.name){
    case 'IF':if(args.length!==3)break;return value(Boolean(value(args[0]))?args[1]:args[2]);
    case 'ABS':if(args.length!==1)break;return Math.abs(number(value(args[0])));
    case 'ROUND':if(args.length!==2)break;{
     const precision=number(value(args[1]));if(!Number.isInteger(precision)||Math.abs(precision)>10)
      throw Error('Invalid formula rounding precision');
     const factor=10**precision;return Math.round(number(value(args[0]))*factor)/factor;
    }
    case 'CONCAT':if(args.length<2)break;return args.map(x=>String(value(x)??'')).join('');
    case 'LEN':if(args.length!==1)break;return String(value(args[0])??'').length;
    case 'UPPER':if(args.length!==1)break;return String(value(args[0])??'').toUpperCase();
    case 'LOWER':if(args.length!==1)break;return String(value(args[0])??'').toLowerCase();
    case 'ISBLANK':if(args.length!==1)break;return value(args[0])===null||value(args[0])==='';
   }
   throw Error('Invalid formula function arguments');
  }
  throw Error('Invalid formula operation');
 }
 async validate(tenant:string,objectApi:string,expression:string,returnType:string){
  if(!supportedTypes.has(returnType))throw Error('Unsupported formula return type');
  const ast=this.parse(expression),refs=this.references(ast);
  const {rows}=await this.db.query<{api_name:string;data_type:string}>(`
   SELECT api_name,data_type FROM md_field_definitions
   WHERE tenant_id=$1 AND object_api=$2`,[tenant,objectApi]);
  const available=new Map(rows.map(r=>[r.api_name,r.data_type]));
  for(const name of refs){
   if(!available.has(name)||available.get(name)==='formula')throw Error('Unknown or circular formula field: '+name);
  }
  const example:Record<string,Value>={};
  for(const name of refs)example[name]=available.get(name)==='boolean'?true:
   ['number','currency','percent'].includes(available.get(name)??'')?1:'sample';
  const test=this.evaluate(ast,example);
  const actual=returnType==='Checkbox'?'boolean':returnType==='Text'?'string':'number';
  if(typeof test!==actual)throw Error('Formula result does not match return type');
  return {valid:true,references:refs};
 }
}
