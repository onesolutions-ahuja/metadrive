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
const supportedFunctions=new Set(['IF','AND','OR','NOT','ISBLANK','ISNULL','BLANKVALUE','NULLVALUE',
  'TEXT','VALUE','LEN','LOWER','UPPER','TRIM','LEFT','RIGHT','MID','FIND','CONTAINS','BEGINS',
  'ABS','ROUND','MIN','MAX','GEOLOCATION','DISTANCE']);
const text=(value:unknown):string=>value===null||value===undefined?'':String(value);
const truth=(value:unknown):boolean=>value===true||value===1||value==='true';

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
    case 'IF':arity(3);return truth(argument(0))?argument(1):argument(2);
    case 'AND':arity(1,20);return node.args.every(item=>truth(evaluate(item,resolve)));
    case 'OR':arity(1,20);return node.args.some(item=>truth(evaluate(item,resolve)));
    case 'NOT':arity(1);return !truth(argument(0));
    case 'ISBLANK':case 'ISNULL':arity(1);return argument(0)===null||argument(0)===undefined||argument(0)==='';
    case 'BLANKVALUE':case 'NULLVALUE':arity(2);{
      const value=argument(0);return value===null||value===undefined||value===''?argument(1):value;
    }
    case 'TEXT':arity(1);return text(argument(0));
    case 'VALUE':arity(1);return numeric(argument(0));
    case 'LEN':arity(1);return text(argument(0)).length;
    case 'LOWER':arity(1);return text(argument(0)).toLowerCase();
    case 'UPPER':arity(1);return text(argument(0)).toUpperCase();
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
    case 'CONTAINS':arity(2);return text(argument(0)).includes(text(argument(1)));
    case 'BEGINS':arity(2);return text(argument(0)).startsWith(text(argument(1)));
    case 'ABS':arity(1);return Math.abs(numeric(argument(0)));
    case 'ROUND':arity(1,2);{
      const scale=node.args[1]?Math.trunc(numeric(argument(1))):0;
      const factor=10**scale;return Math.round((numeric(argument(0))+Number.EPSILON)*factor)/factor;
    }
    case 'MIN':arity(1,20);return Math.min(...node.args.map(item=>numeric(evaluate(item,resolve))));
    case 'MAX':arity(1,20);return Math.max(...node.args.map(item=>numeric(evaluate(item,resolve))));
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

export function validateFlowResources(resources:unknown):string[] {
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
      try{validateFlowFormula(String(item.value??''));}
      catch(error){errors.push('Invalid Flow formula resource '+String(item.name)+': '
        +(error instanceof Error?error.message:'Invalid formula'));}
    }
  }
  return errors;
}
