/**
 * Acetill's original React DOM and CSS remain the default visual design.
 * These stable DOM hooks are *not* registered OneComponents.
 */
export const ACETILL_STYLE_TARGETS = {
  categories: 'Category navigation',
  topbar: 'Top toolbar',
  search: 'Product search',
  products: 'Product grid',
  quickActions: 'Quick actions',
  order: 'Current order panel',
  orderHeading: 'Order heading',
  checkout: 'Checkout section',
  paymentChoices: 'Payment buttons',
  cash: 'Cash button',
  card: 'Card button',
  lock: 'Lock button',
  settings: 'PIN settings button',
  customerDisplay: 'Customer display button'
} as const;

export type AcetillStyleTarget = keyof typeof ACETILL_STYLE_TARGETS;
export type AcetillStyleRule = Record<string,string>;
export type AcetillVisualStyles = Partial<Record<AcetillStyleTarget,AcetillStyleRule>>;

const allowed = new Set([
 'color','backgroundColor','width','height','borderColor','borderWidth',
 'borderRadius','padding','margin','fontSize','fontWeight','opacity',
 'translateX','translateY'
]);
const colorPattern = /^(?:#[\da-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla)\([\d.,%\s]+\)|[a-zA-Z]{2,20})$/;
const sizePattern = /^-?\d{1,4}(?:\.\d{1,2})?(?:px|%|rem|em|vw|vh)?$/;
export function validAcetillStyleValue(property:string,value:string):boolean{
 if(!allowed.has(property)||value.length>80)return false;
 if(['color','backgroundColor','borderColor'].includes(property))return colorPattern.test(value);
 if(['translateX','translateY'].includes(property))return /^-?\d{1,4}$/.test(value);
 if(property==='fontWeight')return /^(?:normal|bold|[1-9]00)$/.test(value);
 if(property==='opacity')return /^(?:0(?:\.\d{1,2})?|1(?:\.0{1,2})?)$/.test(value);
 return sizePattern.test(value) || ['width','height'].includes(property) && value==='auto';
}
const cssName=(key:string)=>key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
export function acetillStyleCss(styles:AcetillVisualStyles):string{
 const result:string[]=[];
 for(const [target,props] of Object.entries(styles)){
  if(!(target in ACETILL_STYLE_TARGETS)||!props||typeof props!=='object'||Array.isArray(props))continue;
  const body:string[]=[];
  for(const [key,value] of Object.entries(props)){
   if(typeof value!=='string'||!validAcetillStyleValue(key,value))continue;
   if(key==='translateX'||key==='translateY')continue;
   body.push(`${cssName(key)}: ${value} !important;`);
  }
  const x=props.translateX??'0',y=props.translateY??'0';
  if(validAcetillStyleValue('translateX',x)&&validAcetillStyleValue('translateY',y)
     &&(x!=='0'||y!=='0')) body.push(`transform: translate(${x}px,${y}px) !important;`);
  if(body.length)result.push(`[data-acetill-element="${target}"] { ${body.join(' ')} }`);
 }
 return result.join('\n');
}
