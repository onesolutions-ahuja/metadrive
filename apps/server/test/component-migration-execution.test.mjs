import test from 'node:test';
import assert from 'node:assert/strict';
import {assertMigrationStorageMode,executeComponentMigration} from '../scripts/migrate-page-components.mjs';
import {loadAppSeedCatalog} from '../src/seeders/catalog.mjs';

const tenantId='disposable-component-migration';
const document={tenantId,mappings:[{
  from:'LegacyCard',to:'OneCard',tenantApproved:true,parityVerified:true,
  metadataSnapshotVerified:true,draftPublishRollbackVerified:true,
  approvedSurfaces:['page','dashboard','flow']
}]};

test('SQL collection runner refuses non-relational metadata stores',()=>{
  assert.doesNotThrow(()=>assertMigrationStorageMode('relational'));
  for(const mode of ['jsonb','normalized','typed',undefined])
    assert.throws(()=>assertMigrationStorageMode(mode),/RBAC-authorized metadata API/);
});

class MigrationClient {
  constructor(rows,registered){this.rows=rows;this.registered=registered;this.backups=[];this.log=[];}
  async query(sql,params=[]){
    this.log.push(sql.trim().split(/\s+/).slice(0,3).join(' '));
    if(sql.includes('SELECT payload FROM metadrive_rel_library_components'))return {rows:this.registered.map(payload=>({payload}))};
    if(sql.includes('SELECT collection_name,position,payload FROM metadrive_rel_tenant_collection_items'))return {rows:this.rows.filter(row=>row.tenant_id===params[0]&&params[1].includes(row.collection_name)).map(row=>({...row}))};
    if(sql.includes('INSERT INTO metadrive_component_migration_backup')){
      this.backups.push({run_id:params[0],tenant_id:params[1],collection_name:params[2],position:params[3],
        previous_payload:JSON.parse(params[4]),migrated_payload:JSON.parse(params[5]),restored_at:null});
      return {rowCount:1,rows:[]};
    }
    if(sql.includes('FROM metadrive_component_migration_backup WHERE tenant_id=$1 AND run_id=$2::uuid')){
      return {rows:this.backups.filter(row=>row.tenant_id===params[0]&&row.run_id===params[1]).map(row=>({...row}))};
    }
    if(sql.startsWith('UPDATE metadrive_rel_tenant_collection_items')){
      const row=this.rows.find(item=>item.tenant_id===params[1]&&item.collection_name===params[2]&&item.position===params[3]);
      if(!row||JSON.stringify(row.payload)!==params[4])return {rowCount:0,rows:[]};
      row.payload=JSON.parse(params[0]);
      return {rowCount:1,rows:[]};
    }
    if(sql.startsWith('UPDATE metadrive_component_migration_backup SET restored_at')){
      for(const row of this.backups)if(row.tenant_id===params[0]&&row.run_id===params[1])row.restored_at='restored';
      return {rowCount:this.backups.length,rows:[]};
    }
    if(sql.includes('SELECT to_regclass'))return {rows:[{table_name:null}]};
    return {rowCount:0,rows:[]};
  }
}

test('all selected surfaces migrate atomically and rollback from per-collection backups',async()=>{
  const source=[
    {tenant_id:tenantId,collection_name:'pages',position:0,payload:{apiName:'MIGRATION_FIXTURE',components:[{id:'p1',type:'Custom:LegacyCard',properties:{kind:'Card',title:'Page'}}]}},
    {tenant_id:tenantId,collection_name:'dashboards',position:0,payload:{apiName:'MIGRATION_FIXTURE',components:[{id:'d1',type:'Custom',customComponentApiName:'LegacyCard',properties:{kind:'Card',title:'Dashboard'}}]}},
    {tenant_id:tenantId,collection_name:'flows',position:0,payload:{apiName:'MIGRATION_FIXTURE',elements:[{id:1,type:'Screen',config:{fields:[{id:'f1',type:'Custom Component',componentApiName:'LegacyCard',componentPropsJson:'{"kind":"Card","title":"Flow"}'}]}}]}},
    {tenant_id:tenantId,collection_name:'pages',position:1,payload:{apiName:'OTHER_PAGE',components:[{id:'untouched',type:'Custom:LegacyCard',properties:{kind:'Card',title:'Other'}}]}}
  ];
  const originals=structuredClone(source);
  const target=loadAppSeedCatalog().coreComponents.find(component=>component.apiName==='OneCard');
  const client=new MigrationClient(source,[{...target,status:'Published'}]);
  const applied=await executeComponentMigration(client,{tenantId,document,collections:['pages','dashboards','flows'],targetApiNames:['MIGRATION_FIXTURE'],apply:true});
  assert.equal(applied.mode,'applied');
  assert.equal(applied.payloads,3);
  assert.equal(client.backups.length,3);
  assert.deepEqual(new Set(client.backups.map(row=>row.collection_name)),new Set(['pages','dashboards','flows']));
  assert.equal(source[0].payload.components[0].type,'Custom:OneCard');
  assert.equal(source[1].payload.components[0].customComponentApiName,'OneCard');
  assert.equal(source[2].payload.elements[0].config.fields[0].componentApiName,'OneCard');
  assert.equal(source[3].payload.components[0].type,'Custom:LegacyCard');

  const restored=await executeComponentMigration(client,{tenantId,rollback:applied.runId});
  assert.equal(restored.restored,3);
  assert.deepEqual(source,originals);
  assert.ok(client.log.includes('COMMIT'));
});

test('application requires exact target API names before writing metadata',async()=>{
  const client=new MigrationClient([],[]);
  await assert.rejects(
    executeComponentMigration(client,{tenantId,document,collections:['pages'],apply:true}),
    /exact --targets API names/
  );
  assert.deepEqual(client.log,[]);
});

test('rollback refuses a migrated payload changed after cutover',async()=>{
  const rows=[{tenant_id:tenantId,collection_name:'pages',position:0,
    payload:{apiName:'MIGRATION_FIXTURE',components:[{id:'p1',type:'Custom:LegacyCard',properties:{kind:'Card',title:'Page'}}]}}];
  const target=loadAppSeedCatalog().coreComponents.find(component=>component.apiName==='OneCard');
  const client=new MigrationClient(rows,[{...target,status:'Published'}]);
  const applied=await executeComponentMigration(client,{tenantId,document,collections:['pages'],targetApiNames:['MIGRATION_FIXTURE'],apply:true});
  rows[0].payload.components[0].properties.title='Edited after cutover';
  await assert.rejects(executeComponentMigration(client,{tenantId,rollback:applied.runId}),/Rollback conflict/);
  assert.equal(client.backups[0].restored_at,null);
  assert.ok(client.log.includes('ROLLBACK'));
});
