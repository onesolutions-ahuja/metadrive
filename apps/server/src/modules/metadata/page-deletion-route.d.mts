/** Type surface for the generic dependency-checked Page deletion route. */
export type PageDeletionMetadata = {
 apiName: string;
 components?: Array<Record<string,unknown>>;
 [key:string]:unknown;
};
export type PageDeletionTenant = {
 apps?: Array<Record<string,unknown>>;
 pages?: PageDeletionMetadata[];
 flows?: Array<Record<string,unknown>>;
 routeAliases?: Array<Record<string,unknown>>;
};
export function pageDeletionBlockers(tenant:PageDeletionTenant,pageName:string):string[];
export function registerPageDeletionRoute(app:{
 delete:(path:string,...handlers:any[])=>unknown;
},deps:{
 permission:unknown;
 getPrincipal:(res:unknown)=>{tenantId:string};
 getState:()=>{tenants:Record<string,PageDeletionTenant>};
 isProtected:(page:PageDeletionMetadata)=>boolean;
 commit:(next:unknown)=>Promise<void>;
}):void;
