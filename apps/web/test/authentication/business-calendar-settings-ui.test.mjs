import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

test('calendar defaults are suggestions and changes require explicit edit and save',()=>{
 const src=readFileSync(new URL('../../src/core/platform/BusinessCalendarSettings/BusinessCalendarSettings.tsx',import.meta.url),'utf8');
 assert.match(src,/fiscalYearStart: \{ month: 4, day: 6 \}/);
 assert.match(src,/timezone: 'Europe\/London'/);
 assert.match(src,/open: '09:00',\s*close: '17:00'/);
 assert.match(src,/const next = saved \?\? suggestedCalendar\(\)/);
 assert.match(src,/setCalendar\(next\)/);
 assert.match(src,/setConfigured\(Boolean\(saved\)\)/);
 assert.match(src,/Suggested defaults are not saved yet/);
 assert.match(src,/<Pencil size=\{14\} \/> Edit/);
 assert.match(src,/setEditing\(false\)/);
 assert.match(src,/<button type="submit" className="btn btn-primary"/);
 assert.match(src,/<form noValidate onSubmit=/);
 assert.match(src,/setSavedCalendar\(result\.calendar\)/);
});

test('business hours preserve custom minute values and offer half-hour suggestions',()=>{
 const src=readFileSync(new URL('../../src/core/platform/BusinessCalendarSettings/BusinessCalendarSettings.tsx',import.meta.url),'utf8');
 assert.match(src,/const timeOptions = Array\.from\(\{ length: 48 \}/);
 assert.match(src,/onChange\(parsed \?\? ''\)/);
 assert.match(src,/open: parseTime\(hours\.open\)/);
 assert.match(src,/close: parseTime\(hours\.close\)/);
});
