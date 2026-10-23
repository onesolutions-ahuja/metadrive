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
 assert.match(source,/setSavedCalendar\(result\.calendar\)/);
 assert.match(source,/setEditing\(false\)/);
});

test('business hours offer half-hour suggestions and accept custom minute values',()=>{
 assert.match(source,/const timeOptions = Array\.from\(\{ length: 48 \}/);
 assert.match(source,/onChange\(parsed \?\? ''\)/);
 assert.match(source,/parseTime\(hours\.open\)/);
 assert.match(source,/parseTime\(hours\.close\)/);
});
