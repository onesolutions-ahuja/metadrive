import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardFiltersForObject,matchesDashboardFilter,matchesDashboardFilters}
 from '../../apps/web/src/dashboardFilters.js';

const filter:any={id:'status',objectApiName:'Appointment__c',fieldApiName:'Status__c',
 operator:'Equals',value:'Booked'};

test('published dashboard filters respect bound Object and user view values',()=>{
 assert.equal(matchesDashboardFilter({Status__c:'BOOKED'},filter),true);
 assert.equal(matchesDashboardFilter({Status__c:'Cancelled'},filter),false);
 assert.deepEqual(dashboardFiltersForObject([filter],'Different__c'),[]);
 assert.equal(matchesDashboardFilters({Status__c:'Booked'},[filter],'Appointment__c','All'),true);
 assert.equal(matchesDashboardFilters({Status__c:'Cancelled'},[filter],'Appointment__c','All'),false);
 assert.equal(matchesDashboardFilters({Status__c:'Cancelled'},[filter],'Appointment__c','All',
  {status:'Cancelled'}),true);
});
