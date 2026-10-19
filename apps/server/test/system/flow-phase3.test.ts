import assert from 'node:assert/strict';
import {test} from 'node:test';
import {latestOccurrence} from '../../src/system-support/scheduled-flow-dispatcher.js';
import {evaluateFlowDecisionComparison} from '../../src/system-files/flow-decision-runtime.js';
import {evaluateFlowFormula,validateFlowFormula} from '../../src/system-files/flow-formula-runtime.js';
import {readFileSync} from 'node:fs';
import {flowChoiceValues,hydrateFlowScreenChoices} from '../../src/system-files/flow-screen-choice-runtime.js';
import {subflowScalarTypeMatches} from '../../src/system-files/flow-subflow-runtime.js';

test('Monthly schedules anchor to calendar day and clamp short months without drift',()=>{
 const schedule={apiName:'Invoice',object:'Invoice',startDate:'2026-01-31',
  startTime:'09:00',timeZone:'Europe/London',frequency:'Monthly'};
 assert.equal(latestOccurrence(schedule,new Date('2026-02-28T09:01:00Z'))?.toISOString(),
  '2026-02-28T09:00:00.000Z');
 assert.equal(latestOccurrence(schedule,new Date('2026-03-31T08:01:00Z'))?.toISOString(),
  '2026-03-31T08:00:00.000Z');
 assert.equal(latestOccurrence(schedule,new Date('2026-04-30T08:01:00Z'))?.toISOString(),
  '2026-04-30T08:00:00.000Z');
});

test('Monthly schedules do not fire before start or before the local due time',()=>{
 const schedule={apiName:'Invoice',object:'Invoice',startDate:'2026-11-15',
  startTime:'16:30',timeZone:'Europe/London',frequency:'Monthly'};
 assert.equal(latestOccurrence(schedule,new Date('2026-10-19T10:00Z')),null);
 assert.equal(latestOccurrence(schedule,new Date('2026-11-15T16:29Z')),null);
 assert.equal(latestOccurrence(schedule,new Date('2026-11-15T16:30Z'))?.toISOString(),
  '2026-11-15T16:30:00.000Z');
});

test('End With and Does Not Contain are shared decision operators',()=>{
 assert.equal(evaluateFlowDecisionComparison('test@example.com','com','Ends With'),true);
 assert.equal(evaluateFlowDecisionComparison('test@example.com','org','Ends With'),false);
 assert.equal(evaluateFlowDecisionComparison('admin@example.com','test','Does Not Contain'),true);
 assert.equal(evaluateFlowDecisionComparison('admin@example.com','admin','Does Not Contain'),false);
 assert.equal(evaluateFlowDecisionComparison(null,'test','Does Not Contain'),false);
});

test('Visual formula picker now includes runtime-supported IMAGE and time functions',()=>{
 const catalog=readFileSync(new URL('../../../web/src/core/builders/FlowBuilder/flowEditorCatalog.ts',import.meta.url),'utf8');
 for(const name of ['IMAGE','IFERROR','ISCLONE','CURRENCYRATE','TZOFFSET','ISOWEEK','ISOYEAR'])
  assert.ok(catalog.includes("'"+name+"'"),name+' absent from no-code formula picker');
 validateFlowFormula('IMAGE("https://example.com/image.png","Description")');
 const image=evaluateFlowFormula('IMAGE("https://example.com/image.png","Description")',()=>null) as {url:string};
 assert.equal(image.url,'https://example.com/image.png');
});

test('Versioned SQL before-save registration only enables read-only elements',()=>{
 const migration=readFileSync(new URL('../../src/system-support/migrations/20261114-flow-phase3-before-save.sql',import.meta.url),'utf8');
 for(const name of ['Get Records','Loop','Collection Filter','Collection Sort','Transform'])
  assert.ok(migration.includes("'"+name+"'"),'Missing read-only capability '+name);
 assert.doesNotMatch(migration,/('Create Records'|'Delete Records'|'Update Records')/);
 assert.match(migration,/registry_version IN \(1,2\)/);
});

test('Choice Set resources hydrate picklists with validated bounded options',()=>{
 const source={id:2,type:'Screen',label:'Ordering',
  config:{fields:[{apiName:'Meal',type:'Picklist',choiceSetResource:'MealChoices'}]}};
 const next=hydrateFlowScreenChoices(source,[{
  name:'MealChoices',type:'Choice Set',value:'Burger\nWrap\nSalad'
 }]);
 assert.deepEqual((next.config.fields as Array<{choices:string[]}>)[0].choices,
  ['Burger','Wrap','Salad']);
 assert.equal((source.config.fields[0] as Record<string,unknown>).choices,undefined);
 assert.throws(()=>flowChoiceValues('Burger\nBurger'),/unique/);
 assert.throws(()=>hydrateFlowScreenChoices(source,[]),/unavailable/);
});

test('Subflow resource scalar typing matches declaration not just JS scalar type',()=>{
 assert.equal(subflowScalarTypeMatches({name:'Count',dataType:'Number'},3),true);
 assert.equal(subflowScalarTypeMatches({name:'Count',dataType:'Number'},'3'),false);
 assert.equal(subflowScalarTypeMatches({name:'Enabled',dataType:'Boolean'},true),true);
 assert.equal(subflowScalarTypeMatches({name:'Enabled',dataType:'Boolean'},'true'),false);
 assert.equal(subflowScalarTypeMatches({name:'Name',dataType:'Text'},'Coffee'),true);
 assert.equal(subflowScalarTypeMatches({name:'Name',dataType:'Text'},{Name:'Coffee'}),false);
});
