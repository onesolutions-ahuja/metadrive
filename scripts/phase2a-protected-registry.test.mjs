import test from 'node:test';
import assert from 'node:assert/strict';
import {componentRegistryScope,findRegisteredComponent,findProtectedSystemComponent} from '../apps/web/src/componentRegistryLookup.ts';

const ordinary={apiName:'Existing',status:'Published',surfaces:['page']};
const protectedDefinition={apiName:'SystemOnly',scope:'platform-system',ownerNamespace:'MetaDrive',status:'Published',surfaces:['page'],supportedSurfaces:['platform']};

test('2a retains legacy tenant component resolution',()=>{
 assert.equal(componentRegistryScope(ordinary),'tenant');
 assert.equal(findRegisteredComponent([ordinary],'Existing','page'),ordinary);
 assert.equal(findRegisteredComponent([ordinary],'Existing','dashboard'),undefined);
});
test('2a declares protected ownership without granting rendering access',()=>{
 assert.equal(componentRegistryScope(protectedDefinition),'platform-system');
 assert.equal(findProtectedSystemComponent([protectedDefinition],'SystemOnly'),undefined);
 assert.equal(findRegisteredComponent([protectedDefinition],'SystemOnly','page'),undefined);
 assert.equal(findProtectedSystemComponent([ordinary],'Existing'),undefined);
});
