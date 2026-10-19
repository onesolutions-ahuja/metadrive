import assert from 'node:assert/strict';
import test from 'node:test';
import type {PoolClient} from 'pg';
import {formatAutoNumberValue} from '../../src/system-files/auto-number-format.js';
import {decryptFieldValue,encryptFieldValue} from '../../src/system-files/encrypted-field.js';
import {
  applyFieldTypeMigration,
  convertFieldValue,
  fieldTypeConversionSupported,
  fieldTypeSignature,
  rollbackFieldTypeMigration,
  type FieldTypeTarget
} from '../../src/system-files/field-type-migration.js';

const target=(overrides:Partial<FieldTypeTarget>={}):FieldTypeTarget=>({
  dataType:'number',maxLength:null,precision:8,scale:2,required:false,
  unique:false,externalId:false,caseSensitive:false,defaultValue:null,...overrides
});
const value=(overrides:Record<string,unknown>={})=>({
  record_id:'record-1',value_text:'12.30',value_number:null,value_boolean:null,
  value_date:null,value_datetime:null,is_unique:false,case_sensitive:false,...overrides
});
const convert=(source:string,stored:ReturnType<typeof value>,to:FieldTypeTarget=target())=>
  convertFieldValue(source,stored as Parameters<typeof convertFieldValue>[1],to);

test('field datatype migration converts scalar values into validated typed projections',()=>{
  assert.deepEqual(convert('text',value()),{
    value_text:'12.3',value_number:'12.3',value_boolean:null,value_date:null,value_datetime:null,
    reference_record_id:null,geo_latitude:null,geo_longitude:null,address_street:null,address_city:null,
    address_state:null,address_postal_code:null,address_country:null
  });
  assert.deepEqual(convert('text',value({value_text:'true'}),target({dataType:'boolean'})),{
    value_text:'true',value_number:null,value_boolean:true,value_date:null,value_datetime:null,
    reference_record_id:null,geo_latitude:null,geo_longitude:null,address_street:null,address_city:null,
    address_state:null,address_postal_code:null,address_country:null
  });
  assert.deepEqual(convert('text',value({value_text:'2024-02-29'}),target({dataType:'date'})),{
    value_text:'2024-02-29',value_number:null,value_boolean:null,value_date:'2024-02-29',value_datetime:null,
    reference_record_id:null,geo_latitude:null,geo_longitude:null,address_street:null,address_city:null,
    address_state:null,address_postal_code:null,address_country:null
  });
});

test('field datatype migration rejects precision, scale, text length and format violations',()=>{
  assert.throws(()=>convert('text',value({value_text:'1234567'}),target({precision:6,scale:2})),
    /target precision/);
  assert.throws(()=>convert('text',value({value_text:'12.345'})),/target scale/);
  assert.throws(()=>convert('number',value({value_text:'too long'}),target({
    dataType:'text',precision:null,scale:null,maxLength:4
  })),/target text length/);
  assert.throws(()=>convert('text',value({value_text:'not-an-email'}),target({
    dataType:'email',precision:null,scale:null
  })),/valid email/);
  assert.throws(()=>convert('text',value({value_text:'2023-02-29'}),target({dataType:'date'})),
    /Invalid date/);
});

test('field datatype migration compatibility excludes unsupported and lossy families',()=>{
  assert.equal(fieldTypeConversionSupported('Text(80)','Number(12,2)'),true);
  assert.equal(fieldTypeConversionSupported('Currency(12,2)','Text Area'),true);
  assert.equal(fieldTypeConversionSupported('Number(12,2)','Checkbox'),false);
  assert.equal(fieldTypeConversionSupported('Date','Date/Time'),false);
  assert.equal(fieldTypeConversionSupported('Text','Rich Text Area'),true);
  assert.equal(fieldTypeConversionSupported('Lookup(Account)','Text'),true);
  assert.equal(fieldTypeConversionSupported('Lookup(Account)','Lookup(Contact)'),true);
  assert.equal(fieldTypeConversionSupported('Long Text Area','Address'),true);
  assert.equal(fieldTypeConversionSupported('Phone','Geolocation'),true);
  assert.equal(fieldTypeConversionSupported('Text','Auto Number'),true);
  assert.equal(fieldTypeConversionSupported('Text','Formula(Text)'),true);
  assert.equal(fieldTypeConversionSupported('Text','Text (Encrypted)'),true);
  assert.equal(fieldTypeConversionSupported('Formula(Number)','Currency(12,2)'),true);
  assert.equal(fieldTypeConversionSupported('Text (Encrypted)','Text'),true);
});

test('formula return-type signatures participate in safe migration compatibility',()=>{
  assert.equal(fieldTypeSignature('Formula(Text)').dataType,'formula');
  assert.equal(fieldTypeSignature('Formula(DateTime)').dataType,'formula');
  assert.equal(fieldTypeConversionSupported('Formula(Checkbox)','Checkbox'),true);
});

test('Auto Number formatting keeps sequence and year tokens consistent',()=>{
  assert.equal(formatAutoNumberValue('INV-{YYYY}-{0000}',7,2025),'INV-2025-0007');
  assert.equal(formatAutoNumberValue('INV-{YYYY}',7,2025),'INV-2025-7');
});

test('field migration safely projects compound, multi-select and rich text values',()=>{
  assert.deepEqual(convert('longtext',value({value_text:'{"city":"Seattle","postalCode":"98101"}'}),
    target({dataType:'address'})),{
    value_text:null,value_number:null,value_boolean:null,value_date:null,value_datetime:null,
    reference_record_id:null,geo_latitude:null,geo_longitude:null,address_street:null,
    address_city:'Seattle',address_state:null,address_postal_code:'98101',address_country:null
  });
  assert.deepEqual(convert('text',value({value_text:'47.6062,-122.3321'}),
    target({dataType:'geolocation'})),{
    value_text:null,value_number:null,value_boolean:null,value_date:null,value_datetime:null,
    reference_record_id:null,geo_latitude:47.6062,geo_longitude:-122.3321,address_street:null,
    address_city:null,address_state:null,address_postal_code:null,address_country:null
  });
  assert.equal(convert('text',value({value_text:'<p onclick="bad()">hello<script>bad()</script></p>'}),
    target({dataType:'richtext'})).value_text,'<p>hello</p>');
  assert.equal(convert('text',value({value_text:''}),target({dataType:'multipicklist'})).value_text,null);
});

test('field datatype migration validates all rows before changing record values',async()=>{
  const executed:string[]=[];
  let valueBatchRead=false;
  const poolClient={
    query:async(sql:string)=>{
      executed.push(sql);
      if(sql.includes('FROM md_field_definitions')&&sql.includes('FOR UPDATE'))return {rows:[{
        data_type:'text',max_length:40,precision:null,scale:null,required:false,is_unique:false,
        external_id:false,case_sensitive:false,default_value:null
      }],rowCount:1};
      if(sql.includes('FROM md_records r')&&sql.includes('ORDER BY r.id LIMIT 500')){
        if(valueBatchRead)return {rows:[],rowCount:0};
        valueBatchRead=true;
        return {rows:[value({value_text:'not-a-number'})],rowCount:1};
      }
      if(sql.includes('FROM md_records r'))return {rows:[],rowCount:0};
      if(sql.includes('INSERT INTO md_field_type_migrations'))return {rows:[{id:'migration-1'}],rowCount:1};
      return {rows:[],rowCount:0};
    }
  };
  await assert.rejects(async()=>{
    await applyFieldTypeMigration(poolClient as unknown as PoolClient,'tenant','Account','Amount',
      'actor',target({dataType:'text',maxLength:40,precision:null,scale:null}),target());
  },/Invalid numeric value/);
  assert.equal(executed.some(sql=>sql.startsWith('UPDATE md_record_values')),false);
  assert.equal(executed.some(sql=>sql.startsWith('UPDATE md_field_definitions')),false);
});

test('field datatype migration snapshots converted values before atomic typed-value updates',async()=>{
  const statements:string[]=[];
  const snapshotArgs:unknown[][]=[];
  let batchRead=false;
  const poolClient={
    query:async(sql:string,args:unknown[]=[]):Promise<{rows:Array<Record<string,unknown>>;rowCount:number}>=>{
      statements.push(sql);
      if(sql.includes('FROM md_field_definitions')&&sql.includes('FOR UPDATE'))return {rows:[{
        data_type:'text',max_length:40,precision:null,scale:null,required:false,is_unique:false,
        external_id:false,case_sensitive:false,default_value:null
      }],rowCount:1};
      if(sql.startsWith('INSERT INTO md_field_type_migration_values')){
        snapshotArgs.push(args);return {rows:[],rowCount:1};
      }
      if(sql.includes('INSERT INTO md_field_type_migrations'))return {rows:[{id:'migration-1'}],rowCount:1};
      if(sql.includes('FROM md_records r')&&sql.includes('ORDER BY r.id LIMIT 500')){
        if(batchRead)return {rows:[],rowCount:0};
        batchRead=true;
        return {rows:[value()],rowCount:1};
      }
      return {rows:[],rowCount:0};
    }
  };
  const source=target({dataType:'text',maxLength:40,precision:null,scale:null});
  const migrationId=await applyFieldTypeMigration(poolClient as unknown as PoolClient,
    'tenant','Account','Amount','actor',source,target());
  assert.equal(migrationId,'migration-1');
  assert.equal(snapshotArgs.length,1);
  assert.equal(snapshotArgs[0][4],'12.30');
  assert.equal(snapshotArgs[0][11],'12.3');
  assert.ok(statements.some(sql=>sql.startsWith('INSERT INTO md_record_values')));
  assert.ok(statements.some(sql=>sql.startsWith('UPDATE md_field_definitions')));
});

test('field datatype migration materializes formulas through the injected formula runtime',async()=>{
  const snapshots:unknown[][]=[];
  let readBatch=false;
  const client={
    query:async(sql:string,args:unknown[]=[]):Promise<{rows:Array<Record<string,unknown>>;rowCount:number}>=>{
      if(sql.includes('FROM md_field_definitions')&&sql.includes('FOR UPDATE'))return {rows:[{
        data_type:'formula',max_length:null,precision:null,scale:null,required:false,is_unique:false,
        external_id:false,case_sensitive:false,default_value:null
      }],rowCount:1};
      if(sql.includes('FROM md_records r')&&sql.includes('ORDER BY r.id LIMIT 500')){
        if(readBatch)return {rows:[],rowCount:0};
        readBatch=true;
        return {rows:[{...value(),record_id:'record-1',field_exists:false,value_text:null}],rowCount:1};
      }
      if(sql.startsWith('INSERT INTO md_field_type_migrations'))return {rows:[{id:'migration-1'}],rowCount:1};
      if(sql.startsWith('INSERT INTO md_field_type_migration_values'))snapshots.push(args);
      return {rows:[],rowCount:0};
    }
  };
  const source=target({dataType:'formula',precision:null,scale:null,formulaReturnType:'Number'});
  await applyFieldTypeMigration(client as unknown as PoolClient,'tenant','Account','Calculated',
    'actor',source,target({dataType:'number'}),{
      evaluateFormula:async()=>42
    });
  assert.equal(snapshots.length,1);
  assert.equal(snapshots[0][11],'42');
  assert.equal(snapshots[0][12],'42');
});

test('encrypted field migrations never store plaintext in rollback snapshots',async()=>{
  const snapshots:unknown[][]=[];
  let readBatch=false;
  const vault={
    encryptOpaque(value:string){return {ciphertext:Buffer.from(value),keyId:'test-key'};},
    decryptOpaque(ciphertext:Buffer){return ciphertext.toString();}
  };
  const client={
    query:async(sql:string,args:unknown[]=[]):Promise<{rows:Array<Record<string,unknown>>;rowCount:number}>=>{
      if(sql.includes('FROM md_field_definitions')&&sql.includes('FOR UPDATE'))return {rows:[{
        data_type:'text',max_length:40,precision:null,scale:null,required:false,is_unique:false,
        external_id:false,case_sensitive:false,default_value:null
      }],rowCount:1};
      if(sql.includes('FROM md_records r')&&sql.includes('ORDER BY r.id LIMIT 500')){
        if(readBatch)return {rows:[],rowCount:0};
        readBatch=true;
        return {rows:[{...value({value_text:'secret'}),field_exists:true}],rowCount:1};
      }
      if(sql.startsWith('INSERT INTO md_field_type_migrations'))return {rows:[{id:'migration-1'}],rowCount:1};
      if(sql.startsWith('INSERT INTO md_field_type_migration_values'))snapshots.push(args);
      return {rows:[],rowCount:0};
    }
  };
  const source=target({dataType:'text',maxLength:40,precision:null,scale:null});
  await applyFieldTypeMigration(client as unknown as PoolClient,'tenant','Account','Private',
    'actor',source,target({dataType:'encryptedtext',maxLength:175}),{encryptedValueVault:vault});
  assert.equal(snapshots.length,1);
  assert.equal(snapshots[0][33],true);
  const before=String(snapshots[0][4]);
  const after=String(snapshots[0][11]);
  assert.notEqual(before,'secret');
  assert.notEqual(after,'secret');
  assert.equal(decryptFieldValue(vault,'tenant','Account','Private',before),'secret');
  assert.equal(decryptFieldValue(vault,'tenant','Account','Private',after),'secret');
});

test('Auto Number migrations generate unique values and advance the object counter',async()=>{
  const snapshots:unknown[][]=[];
  const counterWrites:unknown[][]=[];
  let readBatch=false;
  const client={
    query:async(sql:string,args:unknown[]=[]):Promise<{rows:Array<Record<string,unknown>>;rowCount:number}>=>{
      if(sql.includes('FROM md_field_definitions')&&sql.includes('FOR UPDATE'))return {rows:[{
        data_type:'text',max_length:40,precision:null,scale:null,required:false,is_unique:false,
        external_id:false,case_sensitive:false,default_value:null
      }],rowCount:1};
      if(sql.includes('FROM md_records r')&&sql.includes('ORDER BY r.id LIMIT 500')){
        if(readBatch)return {rows:[],rowCount:0};
        readBatch=true;
        return {rows:[
          {...value({value_text:'old-1'}),record_id:'record-1',field_exists:false},
          {...value({value_text:'old-2'}),record_id:'record-2',field_exists:false}
        ],rowCount:2};
      }
      if(sql.startsWith('INSERT INTO md_field_type_migrations'))return {rows:[{id:'migration-1'}],rowCount:1};
      if(sql.startsWith('INSERT INTO md_field_type_migration_values'))snapshots.push(args);
      if(sql.startsWith('INSERT INTO md_auto_number_counters'))counterWrites.push(args);
      return {rows:[],rowCount:0};
    }
  };
  const source=target({dataType:'text',maxLength:40,precision:null,scale:null});
  await applyFieldTypeMigration(client as unknown as PoolClient,'tenant','Invoice','Number',
    'actor',source,target({dataType:'autonumber',required:true,unique:true,
      autoNumberFormat:'INV-{YYYY}-{0000}'}));
  const year=new Date().getUTCFullYear();
  assert.match(String(snapshots[0][11]),new RegExp(`^INV-${year}-0001$`));
  assert.match(String(snapshots[1][11]),new RegExp(`^INV-${year}-0002$`));
  assert.equal(counterWrites.at(-1)?.[3],3);
});

test('field datatype rollback restores only the latest unchanged migration',async()=>{
  const statements:string[]=[];
  const migrationRow={
    id:'migration-1',status:'applied',from_data_type:'text',to_data_type:'number',
    from_max_length:40,from_precision:null,from_scale:null,from_required:false,from_unique:false,
    from_external_id:false,from_case_sensitive:false,from_default_value:null,
    to_max_length:null,to_precision:8,to_scale:2,to_required:false,to_unique:false,
    to_external_id:false,to_case_sensitive:false,to_default_value:null,
    current_data_type:'number',current_max_length:null,current_precision:8,current_scale:2,
    current_required:false,current_unique:false,current_external_id:false,current_case_sensitive:false,
    current_default_value:null
  };
  const config=(side:'from'|'to')=>({
    side,related_object:null,global_value_set_api:null,controller_field_api:null,
    relationship_type:null,relationship_name:null,child_relationship_name:null,delete_behavior:null,
    allow_reparenting:false,picklist_restricted:true,auto_number_format:null,
    formula_expression:null,formula_return_type:null,rollup_child_object:null,
    rollup_relationship_field:null,rollup_operation:null,rollup_source_field:null,
    rollup_filter_logic:null,auto_number_counter_exists:false,auto_number_next_value:null
  });
  const poolClient={
    query:async(sql:string):Promise<{rows:Array<Record<string,unknown>>;rowCount:number}>=>{
      statements.push(sql);
      if(sql.includes('FROM md_field_type_migrations m JOIN'))return {rows:[migrationRow],rowCount:1};
      if(sql.includes('FROM md_field_type_migration_config'))
        return {rows:[config('from'),config('to')],rowCount:2};
      if(sql.includes('FROM md_field_definitions f')&&sql.includes('FOR UPDATE'))
        return {rows:[{...config('to'),controller_field_api:null}],rowCount:1};
      if(sql.includes('SELECT id FROM md_field_type_migrations'))return {rows:[{id:'migration-1'}],rowCount:1};
      if(sql.includes('SELECT record_id,before_value_exists'))return {rows:[{
        record_id:'record-1',before_value_exists:true,before_snapshot_encrypted:false,
        before_value_text:'12.30',before_value_number:null,before_value_boolean:null,
        before_value_date:null,before_value_datetime:null,before_reference_record_id:null,
        before_geo_latitude:null,before_geo_longitude:null,before_address_street:null,
        before_address_city:null,before_address_state:null,before_address_postal_code:null,
        before_address_country:null,before_is_unique:false,before_case_sensitive:false
      }],rowCount:1};
      return {rows:[],rowCount:0};
    }
  };
  await rollbackFieldTypeMigration(poolClient as unknown as PoolClient,
    'tenant','Account','Amount','migration-1');
  assert.ok(statements.some(sql=>sql.startsWith('UPDATE md_field_definitions')));
  assert.ok(statements.some(sql=>sql.startsWith('INSERT INTO md_record_values')));
  assert.ok(statements.some(sql=>sql.startsWith('DELETE FROM md_field_picklist_values')));
  assert.ok(statements.some(sql=>sql.startsWith('DELETE FROM md_field_rollup_filters')));
  assert.ok(statements.some(sql=>sql.includes("status='rolled_back'")));
});

test('encrypted field rollback decrypts its protected before-snapshot only for restoration',async()=>{
  const statements:Array<{sql:string;args:unknown[]}>=[];
  const vault={
    encryptOpaque(value:string){return {ciphertext:Buffer.from(value),keyId:'test-key'};},
    decryptOpaque(ciphertext:Buffer){return ciphertext.toString();}
  };
  const fromConfig={
    side:'from',related_object:null,global_value_set_api:null,controller_field_api:null,
    relationship_type:null,relationship_name:null,child_relationship_name:null,delete_behavior:null,
    allow_reparenting:false,picklist_restricted:true,auto_number_format:null,formula_expression:null,
    formula_return_type:null,rollup_child_object:null,rollup_relationship_field:null,
    rollup_operation:null,rollup_source_field:null,rollup_filter_logic:null,
    auto_number_counter_exists:false,auto_number_next_value:null
  };
  const toConfig={...fromConfig,side:'to'};
  const migrationRow={
    status:'applied',from_data_type:'text',to_data_type:'encryptedtext',
    from_max_length:40,from_precision:null,from_scale:null,from_required:false,from_unique:false,
    from_external_id:false,from_case_sensitive:false,from_default_value:null,
    to_max_length:175,to_precision:null,to_scale:null,to_required:false,to_unique:false,
    to_external_id:false,to_case_sensitive:false,to_default_value:null,
    current_data_type:'encryptedtext',current_max_length:175,current_precision:null,current_scale:null,
    current_required:false,current_unique:false,current_external_id:false,
    current_case_sensitive:false,current_default_value:null
  };
  const poolClient={
    query:async(sql:string,args:unknown[]=[]):Promise<{rows:Array<Record<string,unknown>>;rowCount:number}>=>{
      statements.push({sql,args});
      if(sql.includes('FROM md_field_type_migrations m JOIN'))return {rows:[migrationRow],rowCount:1};
      if(sql.includes('FROM md_field_type_migration_config'))
        return {rows:[fromConfig,toConfig],rowCount:2};
      if(sql.includes('FROM md_field_definitions f')&&sql.includes('FOR UPDATE'))
        return {rows:[{...toConfig,controller_field_api:null}],rowCount:1};
      if(sql.startsWith('SELECT id FROM md_field_type_migrations'))
        return {rows:[{id:'migration-1'}],rowCount:1};
      if(sql.startsWith('SELECT record_id,before_value_exists'))return {rows:[{
        record_id:'record-1',before_value_exists:true,before_snapshot_encrypted:true,
        before_value_text:encryptFieldValue(vault,'tenant','Account','Private','secret'),
        before_value_number:null,before_value_boolean:null,before_value_date:null,
        before_value_datetime:null,before_reference_record_id:null,before_geo_latitude:null,
        before_geo_longitude:null,before_address_street:null,before_address_city:null,
        before_address_state:null,before_address_postal_code:null,before_address_country:null,
        before_is_unique:false,before_case_sensitive:false
      }],rowCount:1};
      return {rows:[],rowCount:0};
    }
  };
  await rollbackFieldTypeMigration(poolClient as unknown as PoolClient,
    'tenant','Account','Private','migration-1',{encryptedValueVault:vault});
  const restored=statements.find(statement=>statement.sql.startsWith('INSERT INTO md_record_values'));
  assert.equal(restored?.args[4],'secret');
  assert.notEqual(restored?.args[4],encryptFieldValue(vault,'tenant','Account','Private','secret'));
});
