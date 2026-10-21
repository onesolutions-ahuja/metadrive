import type {PoolClient} from 'pg';

/** Shared AppExchange install hook. Each application owns its independent seeder.
 * This module is lazy-imported only during an actual tenant installation,
 * never during Core boot or by an uninstalled frontend.
 */
const installers:Readonly<Record<string,(client:PoolClient,tenantId:string)=>Promise<void>>>={
  AceChatter:async(client,tenantId)=>{
    const {seedAceChatterFlowsForTenant}=await import('./acechatter-flow.js');
    await seedAceChatterFlowsForTenant(client,tenantId);
  }
};

/** Run within the installer's existing SQL transaction and licence checks. */
export async function seedInstalledAppMetadata(
 client:PoolClient,tenantId:string,appApiName:string
):Promise<void>{
 const seeder=installers[appApiName];
 if(seeder)await seeder(client,tenantId);
}
