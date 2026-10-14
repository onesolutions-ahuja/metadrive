/**
 * Phase 2 owner-approved replacement definitions for 39 unidentified legacy slots.
 * Replacements are intentionally distinct from original names: never pretend to
 * restore historical component identity or silently remap existing Pages.
 * The existing registered runtime/ComponentSandbox remains the only renderer.
 */
export const replacementKinds = Object.freeze([
  'Container','Row','Column','Grid','Card','Text','Heading','Paragraph','Button',
  'Link','Image','TextInput','TextArea','Select','Checkbox','Toggle','Table',
  'List','Badge','Divider','Tabs','Modal','Spacer','Icon','Progress','Alert',
  'Avatar','Statistic','Search','DateInput','NumberInput','CurrencyInput',
  'RadioGroup','Tag','Skeleton','Section','Toolbar','Panel','EmptyState'
]);
const interactive = new Set(['Button','TextInput','TextArea','Select','Checkbox','Toggle','Search','DateInput','NumberInput','CurrencyInput','RadioGroup']);
const labelOf = kind => kind.replace(/([a-z])([A-Z])/g,'$1 $2');
const eventMap={Button:'click',TextInput:'change',TextArea:'change',Select:'change',Checkbox:'change',Toggle:'change',Search:'change',DateInput:'change',NumberInput:'change',CurrencyInput:'change',RadioGroup:'change'};
/** Compiled JS uses only the React injected by the existing trusted compiler.
 * Definitions are explicitly untrusted, so tenant instances remain sandboxed.
 */
const compiledSource = `module.exports.default = function(props) {
  var kind = props.kind || 'Text';
  var tag = kind === 'Button' ? 'button' : kind === 'Link' ? 'a' :
    kind === 'Image' ? 'img' : kind === 'Heading' ? 'h2' :
    kind === 'Divider' ? 'hr' : kind === 'TextInput' || kind === 'Search' ||
    kind === 'DateInput' || kind === 'NumberInput' || kind === 'CurrencyInput' ? 'input' :
    kind === 'TextArea' ? 'textarea' : kind === 'Select' ? 'select' :
    kind === 'List' ? 'ul' : kind === 'Paragraph' ? 'p' : 'div';
  var value = props.title || props.label || kind;
  var safeProps = { 'aria-label': props.accessibleName || value };
  if(tag === 'button') safeProps.type = 'button';
  if(tag === 'input') safeProps.placeholder = props.placeholder || value;
  if(tag === 'img') { safeProps.alt = props.alt || value; safeProps.src = props.src || ''; }
  if(tag === 'a') safeProps.href = props.href || '#';
  if(tag === 'hr' || tag === 'input' || tag === 'img') return React.createElement(tag,safeProps);
  return React.createElement(tag,safeProps,value);
};`;
export function replacementDefinition(kind,position) {
 if(!replacementKinds.includes(kind)||replacementKinds.indexOf(kind)!==position) throw Error('Unknown or mismatched replacement position');
 const label=labelOf(kind);
 return {
   apiName:'RecoveredShared'+kind, label, description:'New generic replacement; not a historical component recovery',
   surfaces:['page','dashboard','flow'],resize:{defaultWidth:320,defaultHeight:120,minWidth:100,minHeight:40},
   jsxSource:'',cssSource:'',compiledJs:compiledSource,scopedCss:'',
   version:1,updatedAt:'2026-10-14T00:00:00.000Z',status:'Draft',
   trustedBundled:false,
   propertyDefinitions:[
     {propertyKey:'kind',label:'Type',kind:'TEXT',defaultValue:kind,displayOrder:0},
     {propertyKey:'label',label:'Label',kind:'TEXT',defaultValue:label,displayOrder:1},
     {propertyKey:'title',label:'Title',kind:'TEXT',defaultValue:label,displayOrder:2}
   ],
   recovery:{replacement:true,legacyPosition:position,publishRequiresReferenceReconciliation:true},
   events:eventMap[kind]?[eventMap[kind]]:[],
   category: interactive.has(kind)?'Inputs':'Shared'
 };
}
export function replacementDefinitions(){
 return replacementKinds.map(replacementDefinition);
}
