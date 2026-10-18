import type {AppSeedDefinition} from '../system-files/app-metadata-seeder.js';

/** Trusted, explicitly registered independent app seeders only.
 * Every published app adds its own lazy importer here; no package metadata
 * is embedded in Core and nothing is loaded for an uninstalled app.
 */
export const appSeeders:Readonly<Record<string,()=>Promise<{default:AppSeedDefinition}>>> = Object.freeze({
  // Example only (not installed): MyApp: () => import('./my-app/seed.js')
});
export async function loadTrustedAppSeed(apiName:string):Promise<AppSeedDefinition|undefined>{
 const load=appSeeders[apiName];
 if(!load)return undefined;
 const module=await load();
 return module.default;
}
