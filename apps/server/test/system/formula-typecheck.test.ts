import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import {ObjectDefinitionService} from '../../src/system-files/object-definition.js';

const createDefinitions=(fields:Record<string,{dataType:string;returnType?:string}>,
  relationships:string[]=[]):ObjectDefinitionService=>{
  const client={query:async(sql:string,args:unknown[])=>{
    if(sql.includes('SELECT 1 FROM md_field_definitions')){
      const key=String(args[1])+'->'+String(args[2]);
      return {rows:relationships.includes(key)?[{'?column?':1}]:[],rowCount:relationships.includes(key)?1:0};
    }
    if(sql.includes('SELECT f.data_type,f.formula_return_type')){
      const key=String(args[1])+'.'+String(args[2]);
      const field=fields[key];
      return {rows:field?[{data_type:field.dataType,formula_return_type:field.returnType??null,
        rollup_source_type:null}]:[],rowCount:field?1:0};
    }
    throw new Error('Unexpected formula metadata query: '+sql);
  }};
  const db={transaction:async(run:(transactionClient:typeof client)=>Promise<unknown>)=>run(client)} as unknown as SqlPersistence;
  return new ObjectDefinitionService(db);
};

test('formula type validation resolves same-object field types and return types',async()=>{
  const definitions=createDefinitions({
    'Invoice__c.Amount':{dataType:'number'},
    'Invoice__c.Name':{dataType:'text'},
    'Invoice__c.Paid__c':{dataType:'boolean'}
  });

  test('formula type validation uses a temporal roll-up source type',async()=>{
    const client={query:async(sql:string)=>{
      if(sql.includes('SELECT f.data_type,f.formula_return_type'))
        return {rows:[{data_type:'rollup',formula_return_type:null,rollup_source_type:'date'}],rowCount:1};
      throw new Error('Unexpected formula metadata query: '+sql);
    }};
    const db={transaction:async(run:(value:typeof client)=>Promise<unknown>)=>run(client)} as unknown as SqlPersistence;
    await new ObjectDefinitionService(db).validateFormula('tenant','Account__c','@Account__c.Earliest__c','Date');
    await assert.rejects(()=>new ObjectDefinitionService(db).validateFormula(
      'tenant','Account__c','@Account__c.Earliest__c','Number'),/does not match return type/);
  });
  assert.deepEqual(await definitions.validateFormula('tenant','Invoice__c',
    'IF(@Invoice__c.Paid__c, @Invoice__c.Amount, 0)','Currency'),
  [{objectApi:'Invoice__c',fieldApi:'Paid__c'},{objectApi:'Invoice__c',fieldApi:'Amount'}]);
  await assert.rejects(()=>definitions.validateFormula('tenant','Invoice__c',
    '@Invoice__c.Name','Number'),/does not match return type/);
  await assert.rejects(()=>definitions.validateFormula('tenant','Invoice__c',
    'IF(@Invoice__c.Amount, 1, 0)','Number'),/invalid argument type/);
});

test('formula type validation checks lookup references and supported functions',async()=>{
  const definitions=createDefinitions({
    'Invoice__c.Total__c':{dataType:'number'},
    'Account__c.AnnualRevenue':{dataType:'currency'},
    'Account__c.Secret__c':{dataType:'encryptedtext'}
  },['Invoice__c->Account__c']);
  assert.deepEqual(await definitions.validateFormula('tenant','Invoice__c',
    '@Account__c.AnnualRevenue + @Invoice__c.Total__c','Number'),
  [{objectApi:'Account__c',fieldApi:'AnnualRevenue'},{objectApi:'Invoice__c',fieldApi:'Total__c'}]);
  await definitions.validateFormula('tenant','Invoice__c',
    'DATETIMEVALUE("2024-01-01T12:00:00Z")','DateTime');
  await definitions.validateFormula('tenant','Invoice__c',
    'TIMEVALUE("12:00:00")','Time');
  await assert.rejects(()=>definitions.validateFormula('tenant','Invoice__c',
    'DATE(2024, 1, 1)','Text'),/does not match return type/);
  await assert.rejects(()=>definitions.validateFormula('tenant','Invoice__c',
    '@Account__c.Secret__c','Text'),/cannot reference encrypted fields/);
});

test('formula type validation rejects unknown fields and cross-object references without a lookup',async()=>{
  const definitions=createDefinitions({'Invoice__c.Amount':{dataType:'number'}});
  await assert.rejects(()=>definitions.validateFormula('tenant','Invoice__c',
    '@Invoice__c.Unknown__c','Number'),/unknown field/);
  await assert.rejects(()=>definitions.validateFormula('tenant','Invoice__c',
    '@Account__c.AnnualRevenue','Number'),/requires a lookup relationship/);
});
