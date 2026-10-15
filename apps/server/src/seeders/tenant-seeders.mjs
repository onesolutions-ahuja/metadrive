// Public compatibility facade for existing tenant installers and future apps.
// Runtime definitions stay authoritative in existing Core and AppExchange catalogs.
export {coreSeedDefinitions} from './core-seeder.mjs';
export {appSeedDefinitions,listAppSeeders,seedInstalledTenantApp} from './app-seeder.mjs';
import {listAppSeeders} from './app-seeder.mjs';
export function listAvailableSeeders(){
  return {core:{id:'metadrive-core'},apps:listAppSeeders()};
}
