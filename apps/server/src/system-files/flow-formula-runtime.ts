type Token={kind:'number'|'string'|'identifier'|'reference'|'operator'|'punctuation';value:string};
type Expression=
  |{kind:'literal';value:string|number|boolean|null}
  |{kind:'reference';value:string}
  |{kind:'unary';operator:string;value:Expression}
  |{kind:'binary';operator:string;left:Expression;right:Expression}
  |{kind:'call';name:string;args:Expression[]};

function tokenize(source:string):Token[] {
  if(source.length>4000)throw new Error('Flow formula exceeds the 4000-character limit');
  const tokens:Token[]=[];
  let index=0;
  while(index<source.length){
    const char=source[index];
    if(/\s/.test(char)){index++;continue;}
    if(char==='"'||char==="'"){
      const quote=char;
      index++;
      let value='';
      let closed=false;
      while(index<source.length){
        if(source[index]==='\\'&&index+1<source.length){value+=source[index+1];index+=2;continue;}
        if(source[index]===quote){
          if(source[index+1]===quote){value+=quote;index+=2;continue;}
          index++;closed=true;break;
        }
        value+=source[index++];
      }
      if(!closed)throw new Error('Unterminated Flow formula string');
      tokens.push({kind:'string',value});
      continue;
    }
    const reference=/^\{!([A-Za-z_$][A-Za-z0-9_$.]*)\}/.exec(source.slice(index));
    if(reference){tokens.push({kind:'reference',value:reference[1]});index+=reference[0].length;continue;}
    const shorthand=/^@([A-Za-z_$][A-Za-z0-9_$.]*)/.exec(source.slice(index));
    if(shorthand){tokens.push({kind:'reference',value:shorthand[1]});index+=shorthand[0].length;continue;}
    const number=/^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)/.exec(source.slice(index));
    if(number){tokens.push({kind:'number',value:number[0]});index+=number[0].length;continue;}
    const identifier=/^[A-Za-z_$][A-Za-z0-9_$.]*/.exec(source.slice(index));
    if(identifier){
      const value=identifier[0];
      const functionCall=/^(AND|OR|NOT)$/i.test(value)
        &&/^\s*\(/.test(source.slice(index+value.length));
      tokens.push({kind:/^(AND|OR|NOT)$/i.test(value)&&!functionCall?'operator':'identifier',value});
      index+=value.length;continue;
    }
    const operator=/^(?:>=|<=|<>|!=|==|[+\-*/%^&=<>])/.exec(source.slice(index));
    if(operator){tokens.push({kind:'operator',value:operator[0]});index+=operator[0].length;continue;}
    if('(),'.includes(char)){tokens.push({kind:'punctuation',value:char});index++;continue;}
    throw new Error('Unsupported Flow formula character: '+char);
  }
  return tokens;
}

const precedence=(operator:string):number=>{
  switch(operator.toUpperCase()){
    case 'OR':return 1;
    case 'AND':return 2;
    case '=':case '==':case '!=':case '<>':case '<':case '<=':case '>':case '>=':return 3;
    case '&':return 4;
    case '+':case '-':return 5;
    case '*':case '/':case '%':return 6;
    case '^':return 7;
    default:return -1;
  }
};

class Parser {
  private position=0;
  constructor(private readonly tokens:Token[]){}
  parse():Expression {
    const value=this.expression(0);
    if(this.position!==this.tokens.length)throw new Error('Invalid Flow formula syntax');
    return value;
  }
  private expression(minimum:number):Expression {
    let left=this.primary();
    while(true){
      const token=this.tokens[this.position];
      if(token?.kind!=='operator')break;
      const level=precedence(token.value);
      if(level<minimum)break;
      this.position++;
      const right=this.expression(level+(token.value==='^'?0:1));
      left={kind:'binary',operator:token.value.toUpperCase(),left,right};
    }
    return left;
  }
  private primary():Expression {
    const token=this.tokens[this.position++];
    if(!token)throw new Error('Incomplete Flow formula');
    if(token.kind==='operator'&&(token.value==='-'||token.value==='+'||token.value.toUpperCase()==='NOT'))
      return {kind:'unary',operator:token.value.toUpperCase(),value:this.expression(8)};
    if(token.value==='('&&token.kind==='punctuation'){
      const value=this.expression(0);
      if(this.tokens[this.position++]?.value!==')')throw new Error('Unclosed Flow formula parenthesis');
      return value;
    }
    if(token.kind==='number')return {kind:'literal',value:Number(token.value)};
    if(token.kind==='string')return {kind:'literal',value:token.value};
    if(token.kind==='reference')return {kind:'reference',value:token.value};
    if(token.kind==='identifier'){
      const name=token.value.toUpperCase();
      if(this.tokens[this.position]?.value==='('){
        this.position++;
        const args:Expression[]=[];
        if(this.tokens[this.position]?.value!==')'){
          do {
            args.push(this.expression(0));
            if(this.tokens[this.position]?.value!==',')break;
            this.position++;
          }while(true);
        }
        if(this.tokens[this.position++]?.value!==')')throw new Error('Invalid Flow formula function call');
        return {kind:'call',name,args};
      }
      if(name==='TRUE')return {kind:'literal',value:true};
      if(name==='FALSE')return {kind:'literal',value:false};
      if(name==='NULL')return {kind:'literal',value:null};
      if(name==='PI')return {kind:'literal',value:Math.PI};
      return {kind:'reference',value:token.value};
    }
    throw new Error('Invalid Flow formula expression');
  }
}

type FormulaResolver=(name:string)=>unknown;
const numeric=(value:unknown):number=>{
  const result=typeof value==='number'?value:typeof value==='string'&&value.trim()?Number(value):NaN;
  if(!Number.isFinite(result))throw new Error('Flow formula expected a finite number');
  return result;
};
const supportedFunctions=new Set(['IF','IFERROR','AND','OR','NOT','XOR','ISBLANK','ISNULL','ISNUMBER',
  'ISCHANGED','ISNEW','PRIORVALUE',
  'BLANKVALUE','NULLVALUE','TEXT','VALUE','LEN','ASCII','LOWER','UPPER','PROPER','TRIM',
  'LEFT','RIGHT','MID','FIND','SUBSTITUTE','CONCATENATE','EXACT','CONTAINS','BEGINS',
  'ISPICKVAL','INCLUDES','REPT','REVERSE','ENCODEURL','URLENCODE','URLDECODE',
  'CHAR','INITCAP','LPAD','RPAD','REPLACE','CASESAFEID',
  'ABS','ROUND','ROUNDUP','ROUNDDOWN','TRUNC','SIGN','MIN','MAX','MOD','SQRT','POWER',
  'CEILING','FLOOR','MCEILING','MFLOOR','EXP','LN','LOG',
  'CASE','DATE','DATEVALUE','DATETIMEVALUE','TODAY','NOW','DAY','MONTH','YEAR','HOUR',
  'MINUTE','SECOND','WEEKDAY','ADDMONTHS','TIMEVALUE','TIMENOW','PI','SIN','COS','TAN',
  'ASIN','ACOS','ATAN','ATAN2','SINH','COSH','TANH','DEGREES','RADIANS',
  'GEOLOCATION','DISTANCE']);
const text=(value:unknown):string=>value===null||value===undefined?'':String(value);
const truth=(value:unknown):boolean=>value===true||value===1||value==='true';
function triggerFieldReference(node:Expression):string {
  if(node.kind!=='reference')throw new Error('Record change functions require a $Record field reference');
  const match=/^\$Record\.([A-Za-z][A-Za-z0-9_]*)$/.exec(node.value);
  if(!match)throw new Error('Record change functions require a $Record field reference');
  return match[1];
}
function requiresRecordTriggerContext(node:Expression):boolean {
  if(node.kind==='call'){
    return ['ISCHANGED','ISNEW','PRIORVALUE'].includes(node.name)
      ||node.args.some(requiresRecordTriggerContext);
  }
  if(node.kind==='unary')return requiresRecordTriggerContext(node.value);
  if(node.kind==='binary')
    return requiresRecordTriggerContext(node.left)||requiresRecordTriggerContext(node.right);
  return false;
}
function triggerFieldValues(field:string,resolve:FormulaResolver) {
  const current=resolve('$Record'),prior=resolve('$Record__Prior');
  if(!current||typeof current!=='object'||Array.isArray(current))
    throw new Error('Record change functions require a Record-Triggered Flow');
  if(!Object.hasOwn(current,field))throw new Error('Unknown Flow record field: '+field);
  const priorValue=prior&&typeof prior==='object'&&!Array.isArray(prior)
    &&Object.hasOwn(prior,field)?(prior as Record<string,unknown>)[field]:null;
  return {current:(current as Record<string,unknown>)[field],prior:priorValue};
}

function evaluate(node:Expression,resolve:FormulaResolver):unknown {
  if(node.kind==='literal')return node.value;
  if(node.kind==='reference')return resolve(node.value);
  if(node.kind==='unary'){
    const value=evaluate(node.value,resolve);
    if(node.operator==='NOT')return !truth(value);
    if(node.operator==='+')return numeric(value);
    return -numeric(value);
  }
  if(node.kind==='binary'){
    const left=evaluate(node.left,resolve);
    if(node.operator==='AND'&&!truth(left))return false;
    if(node.operator==='OR'&&truth(left))return true;
    const right=evaluate(node.right,resolve);
    switch(node.operator){
      case 'AND':return truth(left)&&truth(right);
      case 'OR':return truth(left)||truth(right);
      case '&':return text(left)+text(right);
      case '=':case '==':return left===right;
      case '!=':case '<>':return left!==right;
      case '>':return typeof left==='number'&&typeof right==='number'&&left>right;
      case '>=':return typeof left==='number'&&typeof right==='number'&&left>=right;
      case '<':return typeof left==='number'&&typeof right==='number'&&left<right;
      case '<=':return typeof left==='number'&&typeof right==='number'&&left<=right;
      case '+':return numeric(left)+numeric(right);
      case '-':return numeric(left)-numeric(right);
      case '*':return numeric(left)*numeric(right);
      case '/':{
        const divisor=numeric(right);
        if(divisor===0)throw new Error('Flow formula division by zero');
        return numeric(left)/divisor;
      }
      case '%':return numeric(left)%numeric(right);
      case '^':return Math.pow(numeric(left),numeric(right));
      default:throw new Error('Unsupported Flow formula operator');
    }
  }
  const argument=(index:number):unknown=>{
    if(!node.args[index])throw new Error(node.name+' has too few arguments');
    return evaluate(node.args[index],resolve);
  };
  const arity=(minimum:number,maximum=minimum)=>{
    if(node.args.length<minimum||node.args.length>maximum)
      throw new Error('Invalid argument count for '+node.name);
  };
  switch(node.name){
    case 'ISCHANGED':arity(1);{
      const field=triggerFieldReference(node.args[0]);
      const values=triggerFieldValues(field,resolve);
      return values.current!==values.prior;
    }
    case 'ISNEW':arity(0);{
      const record=resolve('$Record');
      if(!record||typeof record!=='object'||Array.isArray(record))
        throw new Error('ISNEW requires a Record-Triggered Flow');
      return resolve('$Record__Prior')===null;
    }
    case 'PRIORVALUE':arity(1);{
      const field=triggerFieldReference(node.args[0]);
      return triggerFieldValues(field,resolve).prior;
    }
    case 'IF':arity(3);return truth(argument(0))?argument(1):argument(2);
    case 'IFERROR':arity(2);{
      try{return argument(0);}
      catch{return argument(1);}
    }
    case 'AND':arity(1,20);return node.args.every(item=>truth(evaluate(item,resolve)));
    case 'OR':arity(1,20);return node.args.some(item=>truth(evaluate(item,resolve)));
    case 'NOT':arity(1);return !truth(argument(0));
    case 'XOR':arity(2,20);return node.args.reduce((value,item)=>
      value!==truth(evaluate(item,resolve)),false);
    case 'ISBLANK':case 'ISNULL':arity(1);return argument(0)===null||argument(0)===undefined||argument(0)==='';
    case 'ISNUMBER':arity(1);{
      const value=argument(0);
      return typeof value==='number'&&Number.isFinite(value)
        ||typeof value==='string'&&value.trim()!==''&&Number.isFinite(Number(value));
    }
    case 'CASE':arity(4,12);{
      if(node.args.length%2!==0)throw new Error('CASE requires a comparison value and a default result');
      const expression=argument(0);
      for(let index=1;index<node.args.length-1;index+=2)
        if(expression===evaluate(node.args[index],resolve))return evaluate(node.args[index+1],resolve);
      return evaluate(node.args[node.args.length-1],resolve);
    }
    case 'BLANKVALUE':case 'NULLVALUE':arity(2);{
      const value=argument(0);return value===null||value===undefined||value===''?argument(1):value;
    }
    case 'TEXT':arity(1);return text(argument(0));
    case 'VALUE':arity(1);return numeric(argument(0));
    case 'LEN':arity(1);return text(argument(0)).length;
    case 'ASCII':arity(1);return text(argument(0)).codePointAt(0)??0;
    case 'LOWER':arity(1);return text(argument(0)).toLowerCase();
    case 'UPPER':arity(1);return text(argument(0)).toUpperCase();
    case 'PROPER':case 'INITCAP':arity(1);return text(argument(0)).toLowerCase()
      .replace(/(^|[^A-Za-z])([A-Za-z])/g,(_match,prefix:string,letter:string)=>prefix+letter.toUpperCase());
    case 'TRIM':arity(1);return text(argument(0)).trim();
    case 'LEFT':arity(1,2);return text(argument(0)).slice(0,argument(1)===undefined?1:Math.max(0,Math.trunc(numeric(argument(1)))));
    case 'RIGHT':arity(1,2);{
      const value=text(argument(0)),length=argument(1)===undefined?1:Math.max(0,Math.trunc(numeric(argument(1))));
      return value.slice(Math.max(0,value.length-length));
    }
    case 'MID':arity(3);{
      const value=text(argument(0)),start=Math.max(0,Math.trunc(numeric(argument(1)))-1);
      return value.slice(start,start+Math.max(0,Math.trunc(numeric(argument(2)))));
    }
    case 'FIND':arity(2,3);{
      const haystack=text(argument(1)),needle=text(argument(0));
      const start=node.args[2]?Math.max(0,Math.trunc(numeric(argument(2)))-1):0;
      const found=haystack.indexOf(needle,start);
      return found<0?0:found+1;
    }
    case 'SUBSTITUTE':arity(3,4);{
      const source=text(argument(0)),search=text(argument(1)),replacement=text(argument(2));
      if(!search)return source;
      const instance=node.args[3]?Math.trunc(numeric(argument(3))):0;
      if(instance<0)throw new Error('SUBSTITUTE instance must not be negative');
      if(instance===0)return source.split(search).join(replacement);
      let count=0;
      return source.replaceAll(search,match=>++count===instance?replacement:match);
    }
    case 'CONCATENATE':arity(1,20);return node.args.map(item=>text(evaluate(item,resolve))).join('');
    case 'EXACT':arity(2);return text(argument(0))===text(argument(1));
    case 'CONTAINS':arity(2);return text(argument(0)).includes(text(argument(1)));
    case 'BEGINS':arity(2);return text(argument(0)).startsWith(text(argument(1)));
    case 'ISPICKVAL':arity(2);return text(argument(0))===text(argument(1));
    case 'INCLUDES':arity(2);{
      const choices=text(argument(0)).split(';').filter(Boolean);
      const expected=text(argument(1));
      return choices.includes(expected);
    }
    case 'REPT':arity(2);{
      const value=text(argument(0)),count=Math.trunc(numeric(argument(1)));
      if(count<0||value.length*count>4000)throw new Error('REPT result exceeds the 4000-character limit');
      return value.repeat(count);
    }
    case 'LPAD':case 'RPAD':arity(2,3);{
      const source=text(argument(0)),length=Math.trunc(numeric(argument(1))),
        pad=node.args[2]?text(argument(2)):' ';
      if(length<0||length>4000||!pad)throw new Error('Invalid '+node.name+' arguments');
      if(source.length>=length)return source.slice(0,length);
      const fill=pad.repeat(Math.ceil((length-source.length)/pad.length)).slice(0,length-source.length);
      return node.name==='LPAD'?fill+source:source+fill;
    }
    case 'REPLACE':arity(4);{
      const source=text(argument(0)),start=Math.trunc(numeric(argument(1)))-1,
        length=Math.trunc(numeric(argument(2))),replacement=text(argument(3));
      if(start<0||length<0)throw new Error('Invalid REPLACE position or length');
      return source.slice(0,start)+replacement+source.slice(start+length);
    }
    case 'CHAR':arity(1);{
      const code=Math.trunc(numeric(argument(0)));
      if(code<1||code>255)throw new Error('CHAR requires a value from 1 to 255');
      return String.fromCharCode(code);
    }
    case 'CASESAFEID':arity(1);{
      const id=text(argument(0));
      if(!/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/.test(id))
        throw new Error('CASESAFEID requires a 15- or 18-character record ID');
      const source=id.slice(0,15),alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
      const suffix=Array.from({length:3},(_,block)=>{
        let mask=0;
        for(let bit=0;bit<5;bit++)
          if(source[block*5+bit]>='A'&&source[block*5+bit]<='Z')mask|=1<<bit;
        return alphabet[mask];
      }).join('');
      if(id.length===18&&id.slice(15)!==suffix)
        throw new Error('CASESAFEID received an invalid 18-character record ID');
      return source+suffix;
    }
    case 'REVERSE':arity(1);return [...text(argument(0))].reverse().join('');
    case 'ENCODEURL':case 'URLENCODE':arity(1);return encodeURIComponent(text(argument(0)));
    case 'URLDECODE':arity(1);{
      try{return decodeURIComponent(text(argument(0)));}
      catch{throw new Error('Invalid URL-encoded Flow formula text');}
    }
    case 'ABS':arity(1);return Math.abs(numeric(argument(0)));
    case 'ROUND':arity(1,2);{
      const scale=node.args[1]?Math.trunc(numeric(argument(1))):0;
      if(Math.abs(scale)>10)throw new Error('Invalid formula rounding precision');
      const value=numeric(argument(0)),factor=10**scale;
      const magnitude=Math.abs(value);
      return Math.sign(value)*Math.round((magnitude+Number.EPSILON*magnitude)*factor)/factor;
    }
    case 'ROUNDUP':case 'ROUNDDOWN':case 'TRUNC':arity(1,2);{
      const scale=node.args[1]?Math.trunc(numeric(argument(1))):0;
      if(Math.abs(scale)>10)throw new Error('Invalid formula rounding precision');
      const factor=10**scale,value=numeric(argument(0))*factor;
      const rounded=node.name==='ROUNDUP'
        ?Math.sign(value)*Math.ceil(Math.abs(value))
        :Math.trunc(value);
      return rounded/factor;
    }
    case 'SIGN':arity(1);return Math.sign(numeric(argument(0)));
    case 'MIN':arity(1,20);return Math.min(...node.args.map(item=>numeric(evaluate(item,resolve))));
    case 'MAX':arity(1,20);return Math.max(...node.args.map(item=>numeric(evaluate(item,resolve))));
    case 'MOD':arity(2);{
      const divisor=numeric(argument(1));
      if(divisor===0)throw new Error('MOD divisor must not be zero');
      return numeric(argument(0))%divisor;
    }
    case 'SQRT':arity(1);{
      const value=numeric(argument(0));
      if(value<0)throw new Error('SQRT requires a non-negative value');
      return Math.sqrt(value);
    }
    case 'POWER':arity(2);return numeric(argument(0))**numeric(argument(1));
    case 'CEILING':arity(1);return Math.ceil(numeric(argument(0)));
    case 'FLOOR':arity(1);return Math.floor(numeric(argument(0)));
    case 'MCEILING':arity(1);return Math.ceil(numeric(argument(0)));
    case 'MFLOOR':arity(1);return Math.floor(numeric(argument(0)));
    case 'EXP':arity(1);return Math.exp(numeric(argument(0)));
    case 'LN':arity(1);{
      const value=numeric(argument(0));
      if(value<=0)throw new Error('LN requires a positive value');
      return Math.log(value);
    }
    case 'LOG':arity(1,2);{
      const value=numeric(argument(0)),base=node.args[1]?numeric(argument(1)):10;
      if(value<=0||base<=0||base===1)throw new Error('Invalid LOG arguments');
      return Math.log(value)/Math.log(base);
    }
    case 'PI':arity(0);return Math.PI;
    case 'SIN':arity(1);return Math.sin(numeric(argument(0)));
    case 'COS':arity(1);return Math.cos(numeric(argument(0)));
    case 'TAN':arity(1);return Math.tan(numeric(argument(0)));
    case 'ASIN':case 'ACOS':arity(1);{
      const value=numeric(argument(0));
      if(value< -1||value>1)throw new Error(node.name+' argument must be between -1 and 1');
      return node.name==='ASIN'?Math.asin(value):Math.acos(value);
    }
    case 'ATAN':arity(1);return Math.atan(numeric(argument(0)));
    case 'ATAN2':arity(2);return Math.atan2(numeric(argument(0)),numeric(argument(1)));
    case 'SINH':arity(1);return Math.sinh(numeric(argument(0)));
    case 'COSH':arity(1);return Math.cosh(numeric(argument(0)));
    case 'TANH':arity(1);return Math.tanh(numeric(argument(0)));
    case 'DEGREES':arity(1);return numeric(argument(0))*180/Math.PI;
    case 'RADIANS':arity(1);return numeric(argument(0))*Math.PI/180;
    case 'DATE':arity(3);{
      const year=Math.trunc(numeric(argument(0))),month=Math.trunc(numeric(argument(1))),
        day=Math.trunc(numeric(argument(2)));
      if(year<1||year>9999||month<1||month>12||day<1||day>31)
        throw new Error('Invalid DATE arguments');
      const date=new Date(Date.UTC(year,month-1,day));
      if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)
        throw new Error('Invalid DATE arguments');
      return date.toISOString().slice(0,10);
    }
    case 'DATEVALUE':arity(1);{
      const input=text(argument(0));
      const dateOnly=/^\d{4}-\d{2}-\d{2}$/.test(input)?input:input.slice(0,10);
      const date=new Date(dateOnly+'T00:00:00Z');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)||Number.isNaN(date.getTime())
        ||date.toISOString().slice(0,10)!==dateOnly)
        throw new Error('DATEVALUE requires an ISO date or date/time');
      return dateOnly;
    }
    case 'DATETIMEVALUE':arity(1);{
      const input=text(argument(0));
      const dateTime=/^\d{4}-\d{2}-\d{2}$/.test(input)?input+'T00:00:00Z':input;
      if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(dateTime))
        throw new Error('DATETIMEVALUE requires an ISO date/time');
      const datePart=dateTime.slice(0,10),date=new Date(datePart+'T00:00:00Z');
      if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==datePart)
        throw new Error('DATETIMEVALUE requires an ISO date/time');
      const timestamp=Date.parse(dateTime);
      if(!Number.isFinite(timestamp))throw new Error('DATETIMEVALUE requires an ISO date/time');
      return new Date(timestamp).toISOString();
    }
    case 'TIMEVALUE':arity(1);{
      const input=text(argument(0));
      const match=/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,3}))?)?$/.exec(input);
      if(match)return `${match[1]}:${match[2]}:${match[3]??'00'}.${(match[4]??'').padEnd(3,'0')}`;
      if(!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(input))
        throw new Error('TIMEVALUE requires a time or ISO date/time');
      const timestamp=Date.parse(input);
      if(!Number.isFinite(timestamp))throw new Error('TIMEVALUE requires a time or ISO date/time');
      const date=new Date(timestamp);
      return `${String(date.getUTCHours()).padStart(2,'0')}:${String(date.getUTCMinutes()).padStart(2,'0')}:${String(date.getUTCSeconds()).padStart(2,'0')}.${String(date.getUTCMilliseconds()).padStart(3,'0')}`;
    }
    case 'TIMENOW':arity(0);{
      const date=new Date();
      return `${String(date.getUTCHours()).padStart(2,'0')}:${String(date.getUTCMinutes()).padStart(2,'0')}:${String(date.getUTCSeconds()).padStart(2,'0')}.${String(date.getUTCMilliseconds()).padStart(3,'0')}`;
    }
    case 'TODAY':arity(0);return new Date().toISOString().slice(0,10);
    case 'NOW':arity(0);return new Date().toISOString();
    case 'DAY':case 'MONTH':case 'YEAR':case 'HOUR':case 'MINUTE':case 'SECOND':case 'WEEKDAY':arity(1);{
      const input=text(argument(0));
      const timeOnly=/^\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(input);
      const date=timeOnly?new Date('1970-01-01T'+input+'Z'):new Date(input);
      if(Number.isNaN(date.getTime()))throw new Error(node.name+' requires a date/time value');
      switch(node.name){
        case 'DAY':return date.getUTCDate();
        case 'MONTH':return date.getUTCMonth()+1;
        case 'YEAR':return date.getUTCFullYear();
        case 'HOUR':return date.getUTCHours();
        case 'MINUTE':return date.getUTCMinutes();
        case 'SECOND':return date.getUTCSeconds();
        default:return date.getUTCDay()+1;
      }
    }
    case 'ADDMONTHS':arity(2);{
      const input=text(argument(0)),months=Math.trunc(numeric(argument(1)));
      const date=new Date(input);
      if(Number.isNaN(date.getTime()))throw new Error('ADDMONTHS requires a date/time value');
      const originalDay=date.getUTCDate();
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth()+months);
      const lastDay=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
      date.setUTCDate(Math.min(originalDay,lastDay));
      return /^\d{4}-\d{2}-\d{2}$/.test(input)?date.toISOString().slice(0,10):date.toISOString();
    }
    case 'GEOLOCATION':arity(2);{
      const latitude=numeric(argument(0)),longitude=numeric(argument(1));
      if(latitude < -90||latitude > 90||longitude < -180||longitude > 180)
        throw new Error('Invalid formula geolocation coordinates');
      return {latitude,longitude};
    }
    case 'DISTANCE':arity(3);{
      const first=argument(0),second=argument(1),unit=text(argument(2)).toLowerCase();
      const coordinates=(value:unknown)=>{
        if(!value||typeof value!=='object'||!('latitude' in value)||!('longitude' in value))
          throw new Error('DISTANCE requires two geolocation values');
        const latitude=numeric(value.latitude),longitude=numeric(value.longitude);
        if(latitude < -90||latitude > 90||longitude < -180||longitude > 180)
          throw new Error('Invalid formula geolocation coordinates');
        return {latitude,longitude};
      };
      const a=coordinates(first),b=coordinates(second);
      const toRadians=(degrees:number)=>degrees*Math.PI/180;
      const latitudeDelta=toRadians(b.latitude-a.latitude);
      const longitudeDelta=toRadians(b.longitude-a.longitude);
      const haversine=Math.sin(latitudeDelta/2)**2
        +Math.cos(toRadians(a.latitude))*Math.cos(toRadians(b.latitude))
          *Math.sin(longitudeDelta/2)**2;
      const kilometers=6371.0088*2*Math.atan2(Math.sqrt(haversine),Math.sqrt(1-haversine));
      if(unit==='km')return kilometers;
      if(unit==='mi')return kilometers/1.609344;
      throw new Error('DISTANCE unit must be "km" or "mi"');
    }
    default:throw new Error('Unsupported Flow formula function: '+node.name);
  }
}

export function evaluateFlowFormula(expression:string,resolve:FormulaResolver):unknown {
  if(typeof expression!=='string'||!expression.trim())throw new Error('Flow formula is empty');
  return evaluate(new Parser(tokenize(expression)).parse(),resolve);
}

export function validateFlowFormula(expression:string):void {
  if(typeof expression!=='string'||!expression.trim())throw new Error('Flow formula is empty');
  const inspect=(node:Expression)=>{
    if(node.kind==='call'){
      if(!supportedFunctions.has(node.name))throw new Error('Unsupported Flow formula function: '+node.name);
      node.args.forEach(inspect);
    }else if(node.kind==='unary')inspect(node.value);
    else if(node.kind==='binary'){inspect(node.left);inspect(node.right);}
  };
  inspect(new Parser(tokenize(expression)).parse());
}

export type FormulaValueType='Number'|'Text'|'Checkbox'|'Date'|'DateTime'|'Time'
  |'Picklist'|'MultiPicklist'|'Geolocation'|'Null';
type FormulaTypeResolver=(reference:string)=>FormulaValueType|null;
const formulaTextTypes=new Set<FormulaValueType>(['Text','Picklist']);
const formulaNumeric=(type:FormulaValueType)=>type==='Number';
const compatibleFormulaTypes=(left:FormulaValueType,right:FormulaValueType):FormulaValueType|null=>{
  if(left==='Null')return right;
  if(right==='Null')return left;
  if(left===right)return left;
  if(formulaTextTypes.has(left)&&formulaTextTypes.has(right))return 'Text';
  return null;
};
export function flowFormulaReferences(expression:string):string[] {
  const found=new Set<string>();
  const visit=(node:Expression):void=>{
    if(node.kind==='reference')found.add(node.value);
    else if(node.kind==='unary')visit(node.value);
    else if(node.kind==='binary'){visit(node.left);visit(node.right);}
    else if(node.kind==='call')node.args.forEach(visit);
  };
  visit(new Parser(tokenize(expression)).parse());
  return [...found];
}
export function inferFlowFormulaType(expression:string,resolve:FormulaTypeResolver):FormulaValueType {
  validateFlowFormula(expression);
  const infer=(node:Expression):FormulaValueType=>{
    if(node.kind==='literal')return node.value===null?'Null':typeof node.value==='number'?'Number':
      typeof node.value==='boolean'?'Checkbox':'Text';
    if(node.kind==='reference'){
      const type=resolve(node.value);
      if(!type)throw new Error('Unknown formula field reference: '+node.value);
      return type;
    }
    if(node.kind==='unary'){
      const type=infer(node.value);
      if(node.operator==='NOT'){
        if(type!=='Checkbox')throw new Error('NOT requires a checkbox value');
        return 'Checkbox';
      }
      if(!formulaNumeric(type))throw new Error('Numeric unary operators require a number');
      return 'Number';
    }
    if(node.kind==='binary'){
      const left=infer(node.left),right=infer(node.right),operator=node.operator;
      if(operator==='AND'||operator==='OR'){
        if(left!=='Checkbox'||right!=='Checkbox')throw new Error(operator+' requires checkbox values');
        return 'Checkbox';
      }
      if(operator==='&')return 'Text';
      if(['=','==','!=','<>'].includes(operator)){
        if(!compatibleFormulaTypes(left,right))throw new Error('Formula comparison types do not match');
        return 'Checkbox';
      }
      if(['>','>=','<','<='].includes(operator)){
        if(!formulaNumeric(left)||!formulaNumeric(right))
          throw new Error('Ordered formula comparisons require numeric values');
        return 'Checkbox';
      }
      if(!formulaNumeric(left)||!formulaNumeric(right))
        throw new Error('Arithmetic formula operators require numeric values');
      return 'Number';
    }
    const args=node.args.map(infer),arity=(minimum:number,maximum=minimum)=>{
      if(args.length<minimum||args.length>maximum)
        throw new Error('Invalid argument count for '+node.name);
    };
    const requireType=(index:number,allowed:FormulaValueType[])=>{
      if(!allowed.includes(args[index]))throw new Error(node.name+' has an invalid argument type');
    };
    const requireText=(index:number)=>requireType(index,['Text','Picklist']);
    const requireNumber=(index:number)=>requireType(index,['Number']);
    switch(node.name){
      case 'ISCHANGED':arity(1);triggerFieldReference(node.args[0]);return 'Checkbox';
      case 'ISNEW':arity(0);return 'Checkbox';
      case 'PRIORVALUE':arity(1);triggerFieldReference(node.args[0]);return args[0];
      case 'IF':arity(3);requireType(0,['Checkbox']);{
        const result=compatibleFormulaTypes(args[1],args[2]);
        if(!result)throw new Error('IF result types do not match');
        return result;
      }
      case 'IFERROR':arity(2);{
        const result=compatibleFormulaTypes(args[0],args[1]);
        if(!result)throw new Error('IFERROR result types do not match');
        return result;
      }
      case 'AND':case 'OR':arity(1,20);args.forEach((_,index)=>requireType(index,['Checkbox']));return 'Checkbox';
      case 'XOR':arity(2,20);args.forEach((_,index)=>requireType(index,['Checkbox']));return 'Checkbox';
      case 'NOT':arity(1);requireType(0,['Checkbox']);return 'Checkbox';
      case 'ISBLANK':case 'ISNULL':case 'ISNUMBER':arity(1);return 'Checkbox';
      case 'BLANKVALUE':case 'NULLVALUE':arity(2);{
        const result=compatibleFormulaTypes(args[0],args[1]);
        if(!result)throw new Error(node.name+' argument types do not match');
        return result;
      }
      case 'TEXT':arity(1);return 'Text';
      case 'VALUE':arity(1);requireText(0);return 'Number';
      case 'LEN':case 'ASCII':arity(1);requireText(0);return 'Number';
      case 'LOWER':case 'UPPER':case 'PROPER':case 'TRIM':case 'REVERSE':
      case 'ENCODEURL':case 'URLENCODE':case 'URLDECODE':arity(1);requireText(0);return 'Text';
      case 'INITCAP':arity(1);requireText(0);return 'Text';
      case 'LEFT':case 'RIGHT':arity(1,2);requireText(0);if(args.length===2)requireNumber(1);return 'Text';
      case 'MID':arity(3);requireText(0);requireNumber(1);requireNumber(2);return 'Text';
      case 'FIND':arity(2,3);requireText(0);requireText(1);if(args.length===3)requireNumber(2);return 'Number';
      case 'SUBSTITUTE':arity(3,4);requireText(0);requireText(1);requireText(2);if(args.length===4)requireNumber(3);return 'Text';
      case 'CONCATENATE':arity(1,20);return 'Text';
      case 'EXACT':case 'CONTAINS':case 'BEGINS':arity(2);requireText(0);requireText(1);return 'Checkbox';
      case 'ISPICKVAL':arity(2);requireType(0,['Picklist']);requireText(1);return 'Checkbox';
      case 'INCLUDES':arity(2);requireType(0,['MultiPicklist']);requireText(1);return 'Checkbox';
      case 'REPT':arity(2);requireText(0);requireNumber(1);return 'Text';
      case 'LPAD':case 'RPAD':arity(2,3);requireText(0);requireNumber(1);if(args.length===3)requireText(2);return 'Text';
      case 'REPLACE':arity(4);requireText(0);requireNumber(1);requireNumber(2);requireText(3);return 'Text';
      case 'CHAR':arity(1);requireNumber(0);return 'Text';
      case 'CASESAFEID':arity(1);requireText(0);return 'Text';
      case 'ABS':case 'CEILING':case 'FLOOR':case 'MCEILING':case 'MFLOOR':
      case 'EXP':case 'LN':case 'SQRT':case 'SIGN':arity(1);requireNumber(0);return 'Number';
      case 'ROUND':arity(1,2);requireNumber(0);if(args.length===2)requireNumber(1);return 'Number';
      case 'ROUNDUP':case 'ROUNDDOWN':case 'TRUNC':
        arity(1,2);requireNumber(0);if(args.length===2)requireNumber(1);return 'Number';
      case 'MIN':case 'MAX':arity(1,20);args.forEach((_,index)=>requireNumber(index));return 'Number';
      case 'MOD':case 'POWER':arity(2);requireNumber(0);requireNumber(1);return 'Number';
      case 'LOG':arity(1,2);requireNumber(0);if(args.length===2)requireNumber(1);return 'Number';
      case 'PI':arity(0);return 'Number';
      case 'SIN':case 'COS':case 'TAN':case 'ASIN':case 'ACOS':case 'ATAN':
      case 'SINH':case 'COSH':case 'TANH':case 'DEGREES':case 'RADIANS':
        arity(1);requireNumber(0);return 'Number';
      case 'ATAN2':arity(2);requireNumber(0);requireNumber(1);return 'Number';
      case 'CASE':arity(4,12);{
        if(args.length%2!==0)throw new Error('CASE requires a comparison value and a default result');
        for(let index=1;index<args.length-1;index+=2)
          if(!compatibleFormulaTypes(args[0],args[index]))
            throw new Error('CASE comparison types do not match');
        let result=args[2];
        for(let index=4;index<args.length;index+=2){
          const compatible=compatibleFormulaTypes(result,args[index]);
          if(!compatible)throw new Error('CASE result types do not match');
          result=compatible;
        }
        const compatible=compatibleFormulaTypes(result,args[args.length-1]);
        if(!compatible)throw new Error('CASE result types do not match');
        return compatible;
      }
      case 'DATE':arity(3);args.forEach((_,index)=>requireNumber(index));return 'Date';
      case 'DATEVALUE':arity(1);requireType(0,['Text','Date','DateTime']);return 'Date';
      case 'DATETIMEVALUE':arity(1);requireType(0,['Text','Date','DateTime']);return 'DateTime';
      case 'TIMEVALUE':arity(1);requireType(0,['Text','DateTime','Time']);return 'Time';
      case 'TIMENOW':arity(0);return 'Time';
      case 'TODAY':arity(0);return 'Date';
      case 'NOW':arity(0);return 'DateTime';
      case 'DAY':case 'MONTH':case 'YEAR':case 'WEEKDAY':
        arity(1);requireType(0,['Date','DateTime']);return 'Number';
      case 'HOUR':case 'MINUTE':case 'SECOND':
        arity(1);requireType(0,['DateTime','Time']);return 'Number';
      case 'ADDMONTHS':arity(2);requireType(0,['Date','DateTime']);requireNumber(1);return args[0];
      case 'GEOLOCATION':arity(2);requireNumber(0);requireNumber(1);return 'Geolocation';
      case 'DISTANCE':arity(3);requireType(0,['Geolocation']);requireType(1,['Geolocation']);requireText(2);return 'Number';
      default:throw new Error('Unsupported Flow formula function: '+node.name);
    }
  };
  return infer(new Parser(tokenize(expression)).parse());
}

export function validateFlowResources(resources:unknown,recordTriggered=false):string[] {
  if(resources===undefined)return [];
  if(!Array.isArray(resources))return ['Flow resources must be an array'];
  const errors:string[]=[];
  const names=new Set<string>();
  for(const resource of resources){
    if(!resource||typeof resource!=='object'||Array.isArray(resource)){
      errors.push('Invalid Flow resource');continue;
    }
    const item=resource as Record<string,unknown>;
    if(typeof item.name!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(item.name)||names.has(item.name))
      errors.push('Flow resource names must be unique valid identifiers');
    else names.add(item.name);
    if(item.type==='Formula'){
      try{
        const expression=String(item.value??'');
        validateFlowFormula(expression);
        if(!recordTriggered&&requiresRecordTriggerContext(
          new Parser(tokenize(expression)).parse()))
          errors.push('Record change formula functions are only supported in Record-Triggered Flows');
      }
      catch(error){errors.push('Invalid Flow formula resource '+String(item.name)+': '
        +(error instanceof Error?error.message:'Invalid formula'));}
    }
  }
  return errors;
}
