import type {SqlPersistence} from '../system-files/sql-persistence.js';
import {ACETILL_STYLE_TARGETS,validAcetillStyleValue,type AcetillVisualStyles} from './acetill-visual-style-schema.js';

/** Tenant-owned visual overrides; never alters installed package or customer Flows. */
export function validateAcetillVisualStyles(raw:unknown):AcetillVisualStyles{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid Acetill styles');
 const entries=Object.entries(raw);
 if(entries.length>Object.keys(ACETILL_STYLE_TARGETS).length)throw new Error('Too many style targets');
 const clean:AcetillVisualStyles={};
 for(const [target,value] of entries){
  if(!(target in ACETILL_STYLE_TARGETS)||!value||typeof value!=='object'||Array.isArray(value))
   throw new Error('Unknown Acetill element');
  const props=Object.entries(value);
  if(props.length>16)throw new Error('Too many style properties');
  const sanitized:Record<string,string>={};
  for(const [property,input] of props){
   if(typeof input!=='string'||!validAcetillStyleValue(property,input))
    throw new Error('Invalid Acetill visual property: '+property);
   sanitized[property]=input;
  }
  clean[target as keyof AcetillVisualStyles]=sanitized;
 }
 return clean;
}
export async function loadAcetillVisualStyles(db:SqlPersistence,tenantId:string):Promise<AcetillVisualStyles>{
 const {rows}=await db.query<{properties:unknown}>(`
  SELECT properties FROM md_system_definitions
  WHERE tenant_id=$1 AND kind='app-visual-styles' AND api_name='AcetillRegister'
    AND enabled=true LIMIT 1`,[tenantId]);
 const raw=rows[0]?.properties;
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
 const styles=(raw as Record<string,unknown>).styles;
 try{return validateAcetillVisualStyles(styles??{});}
 catch{return {};}
}
export async function saveAcetillVisualStyles(db:SqlPersistence,tenantId:string,raw:unknown){
 const styles=validateAcetillVisualStyles(raw);
 await db.query(`INSERT INTO md_system_definitions
   (tenant_id,kind,api_name,label,properties,enabled)
   VALUES($1,'app-visual-styles','AcetillRegister','Acetill visual overrides',$2::jsonb,true)
   ON CONFLICT(tenant_id,kind,api_name)
   DO UPDATE SET properties=EXCLUDED.properties,enabled=true,updated_at=now()`,
  [tenantId,JSON.stringify({version:1,styles})]);
 return styles;
}
