import type {SqlPersistence} from '../system-files/sql-persistence.js';
import {ACETILL_STYLE_TARGETS,validAcetillStyleValue,type AcetillVisualStyles} from './acetill-visual-style-schema.js';

/** Tenant-owned visual drafts are isolated from the published live terminal. */
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
export async function loadAcetillVisualStyles(
 db:SqlPersistence,tenantId:string,mode:'draft'|'published'='published'
):Promise<AcetillVisualStyles>{
 const {rows}=await db.query<{draft_styles:unknown;published_styles:unknown}>(`
  SELECT draft_styles,published_styles FROM md_acetill_visual_styles
  WHERE tenant_id=$1 LIMIT 1`,[tenantId]);
 const raw=mode==='draft'?rows[0]?.draft_styles:rows[0]?.published_styles;
 try{return validateAcetillVisualStyles(raw??{});}
 catch{return {};}
}
export async function saveAcetillVisualStyles(db:SqlPersistence,tenantId:string,raw:unknown){
 const styles=validateAcetillVisualStyles(raw);
 await db.query(`INSERT INTO md_acetill_visual_styles(tenant_id,draft_styles)
   VALUES($1,$2::jsonb) ON CONFLICT(tenant_id)
   DO UPDATE SET draft_styles=EXCLUDED.draft_styles,revision=md_acetill_visual_styles.revision+1,
   updated_at=now()`,[tenantId,JSON.stringify(styles)]);
 return styles;
}
