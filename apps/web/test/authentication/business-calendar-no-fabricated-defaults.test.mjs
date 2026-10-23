import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

test('company business hours remain unconfigured until tenant settings are saved',()=>{
 const src=readFileSync(new URL('../../src/core/platform/BusinessCalendarSettings/BusinessCalendarSettings.tsx',import.meta.url),'utf8');
 assert.match(src,/timezone: ''/);
 assert.match(src,/month: 0, day: 0/);
 assert.match(src,/open: '', close: ''/);
 assert.doesNotMatch(src,/open: '09:00', close: '17:00'/);
 assert.doesNotMatch(src,/timezone: 'Europe\/London'/);
 assert.match(src,/setCalendar\(saved \?\? blankCalendar\(\)\)/);
 assert.match(src,/setConfigured\(Boolean\(saved\)\)/);
 assert.match(src,/Business calendar not configured/);
 assert.match(src,/required=\{!disabled\}/);
 assert.match(src,/disabled=\{calendar\.weeklyHours\[day\]\.closed\}/);
});
