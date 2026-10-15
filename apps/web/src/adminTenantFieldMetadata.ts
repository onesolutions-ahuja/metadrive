/** Existing platform tenant creation API remains the only provisioning authority.
 * Presentation definitions never contain credential values or grant security permissions.
 */
export const tenantCreateFieldDefinitions=[
 {key:'tenantId',label:'Tenant ID',inputType:'text',required:true,minLength:2,maxLength:63,pattern:'[A-Za-z0-9][A-Za-z0-9_-]{1,62}',autoComplete:'off'},
 {key:'tenantName',label:'Organisation name',inputType:'text',required:true,maxLength:120},
 {key:'adminName',label:'Initial administrator name',inputType:'text',required:true,maxLength:120},
 {key:'email',label:'Initial administrator email',inputType:'email',required:true,maxLength:254,autoComplete:'off'},
 {key:'password',label:'Initial administrator password',inputType:'password',required:true,minLength:12,maxLength:256,autoComplete:'new-password'},
 {key:'developerDomain',label:'Developer domain (optional)',inputType:'text',required:false,maxLength:253,placeholder:'tenant-domain.com'}
] as const;
export type TenantCreateFieldKey=typeof tenantCreateFieldDefinitions[number]['key'];
