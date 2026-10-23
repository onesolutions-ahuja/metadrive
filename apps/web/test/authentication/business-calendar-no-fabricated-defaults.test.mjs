import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../../src/core/platform/BusinessCalendarSettings/BusinessCalendarSettings.tsx',import.meta.url),'utf8');

test('saved tenant settings load as-is and suggestions are used only when no calendar exists',()=>{
 assert.match(source,/const next = saved \?\? suggestedCalendar\(\)/);
 assert.match(source,/setCalendar\(next\)/);
 assert.match(source,/setSavedCalendar\(saved\)/);
 assert.match(source,/setConfigured\(Boolean\(saved\)\)/);
 assert.match(source,/fiscalYearStart: \{ month: 4, day: 6 \}/);
 assert.match(source,/timezone: 'Europe\/London'/);
 assert.match(source,/open: '09:00',\s*close: '17:00'/);
 assert.match(source,/Suggested defaults are not saved yet/);
 assert.match(source,/setCalendar\(savedCalendar \?\? suggestedCalendar\(\)\)/);
});

test('calendar opens read-only and requires explicit edit before save',()=>{
 assert.match(source,/<Pencil size=\{14\} \/> Edit/);
 assert.match(source,/editing \? <span><select/);
 assert.match(source,/editing \? <><label className="business-calendar-closed"/);
 assert.match(source,/<button type="submit" className="btn btn-primary"/);
 assert.match(source,/<form noValidate onSubmit=/);
 assert.match(source,/setSavedCalendar\(verified\)/);
 assert.match(source,/cache:'no-store'/);
 assert.match(source,/readback\.calendar/);
 assert.match(source,/setEditing\(false\)/);
});

test('business hours offer half-hour suggestions and accept custom minute values',()=>{
 assert.match(source,/const timeOptions = Array\.from\(\{ length: 48 \}/);
 assert.match(source,/onChange\(parsed \?\? ''\)/);
 assert.match(source,/parseTime\(hours\.open\)/);
 assert.match(source,/parseTime\(hours\.close\)/);
});

const aceAssist=readFileSync(new URL('../../../aceassist/src/AceAssistRuntime.tsx',import.meta.url),'utf8');

test('AceAssist distinguishes a pending calendar request from missing tenant hours',()=>{
 assert.match(aceAssist,/setHoursLoading\(true\)/);
 assert.match(aceAssist,/setHoursLoading\(false\)/);
 assert.match(aceAssist,/hoursLoading\?'Loading business hours/);
 assert.match(aceAssist,/hoursLoading\?'Loading…'/);
 assert.match(aceAssist,/cache:'no-store'/);
 assert.match(aceAssist,/Promise\.allSettled\(relations\.map/);
});

test('first-time calendar entry provides a real save action without a separate edit step',()=>{
 assert.match(source,/setEditing\(saved === null\)/);
 assert.match(source,/No business hours have been saved for this organisation/);
 assert.match(source,/form="business-calendar-form"/);
 assert.match(source,/id="business-calendar-form"/);
 assert.match(source,/Save business hours/);
 assert.match(source,/Server did not confirm the business-hours save/);
 assert.match(source,/metadrive:business-calendar-saved/);
});

test('Business Settings is not obscured by unrelated company and currency forms',()=>{
 const workspace=readFileSync(
  new URL('../../src/core/settings/CompanySettingsWorkspace/CompanySettingsWorkspace.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(workspace,/currentSection==='business'\|\|currentSection==='contacts'/);
 assert.match(workspace,/currentSection==='business'&&<div className="company-workspace-secondary"/);
 assert.match(workspace,/calendar\?\?<BusinessCalendarSettings request=\{apiRequest\} permitted/);
});
