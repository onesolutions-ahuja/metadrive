export type Token={kind:'number'|'string'|'identifier'|'reference'|'operator'|'punctuation';value:string};
export function tokenize(source:string):Token[] {
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

