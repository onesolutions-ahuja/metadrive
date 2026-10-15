import {randomUUID} from 'node:crypto';
/** Declarative one-time credential-to-record metadata seeding. Never reads credential secrets. */
export function seedCredentialGrants(tenant, directives = []) {
  if (!Array.isArray(directives)||!directives.length)return tenant;
  let records=tenant.records,changed=false;
  for(const directive of directives){
    if(!tenant.objects.some(object=>object.apiName===directive.objectApiName))continue;
    const principals=(tenant.accessControl?.users??[]).filter(user=>user.profileId===directive.profileId);
    const target=records[directive.objectApiName]??[];
    const additions=[];
    for(const credential of tenant.namedCredentials??[]){
      if(credential.protocol!=='HTTPS'||credential.enabled===false)continue;
      let url;try{url=new URL(credential.baseUrl);}catch{continue;}
      if(url.protocol!=='https:'||url.hostname!==directive.credentialHost||url.username||url.password||url.search||url.hash)continue;
      const match=new RegExp(directive.accountPathPattern).exec(url.pathname);
      const idFromPath=match?.[1];
      const configured=credential.configuration?.[directive.accountConfigField];
      if(configured&&idFromPath&&configured!==idFromPath)continue;
      const account=idFromPath||configured;
      if(!account||!/^[A-Za-z0-9_-]{5,120}$/.test(account))continue;
      for(const principal of principals){
        const values=Object.fromEntries(Object.entries(directive.fields??{}).map(([key,value])=>
          [key,value==='@user.id'?principal.id:value==='@credential.accountId'?account:
            value==='@credential.name'?credential.name:value]));
        if(target.concat(additions).some(row=>directive.uniqueBy?.every(key=>row[key]===values[key])))continue;
        const now=new Date().toISOString();
        additions.push({Id:randomUUID(),OwnerId:principal.id,RecordTypeId:'master',
          CreatedDate:now,LastModifiedDate:now,...values});
      }
    }
    if(additions.length){records={...records,[directive.objectApiName]:[...target,...additions]};changed=true;}
  }
  return changed?{...tenant,records}:tenant;
}
