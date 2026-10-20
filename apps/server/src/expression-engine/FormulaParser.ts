import type {Token} from './FormulaTokenizer.js';
export type Expression=
  |{kind:'literal';value:string|number|boolean|null}
  |{kind:'reference';value:string}
  |{kind:'unary';operator:string;value:Expression}
  |{kind:'binary';operator:string;left:Expression;right:Expression}
  |{kind:'call';name:string;args:Expression[]};


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

export class Parser {
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

