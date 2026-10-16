// Pure adapter for staged hybrid component metadata. No database writes.
const columns=Object.freeze({
  width:'width',height:'height',x:'x',y:'y',
  backgroundColor:'background_color',textColor:'text_color',
  fontSize:'font_size',padding:'padding',borderRadius:'border_radius'
});
const reserved=new Set([...Object.keys(columns),'visible','region','position']);
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
export function splitComponentProperties(properties={}){
 if(!properties || typeof properties!=='object' || Array.isArray(properties))
  throw new TypeError('Component properties must be a plain metadata object');
 const fixed={};
 const additional={};
 for(const [key,value] of Object.entries(properties)){
  if(own(columns,key)){
   if(value!==null && typeof value!=='string' && typeof value!=='number')
    throw new TypeError('Invalid fixed component property '+key);
   fixed[columns[key]]=value===null?null:String(value);
  }else if(reserved.has(key)){
   throw new TypeError('Structural property must be stored on component instance: '+key);
  }else{
   additional[key]=value;
  }
 }
 return {fixed,additional_properties:additional};
}
export function mergeComponentProperties(row){
 const extra=row.additional_properties??{};
 if(!extra || typeof extra!=='object' || Array.isArray(extra))
  throw new TypeError('additional_properties must be an object');
 for(const key of reserved)if(own(extra,key))
  throw new TypeError('JSONB may not override fixed or structural property '+key);
 const result={...extra};
 for(const [key,column] of Object.entries(columns)){
  if(row[column]!==undefined && row[column]!==null)result[key]=row[column];
 }
 return result;
}
