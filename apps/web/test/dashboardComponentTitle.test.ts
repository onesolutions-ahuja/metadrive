import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceReportTitleUpdate } from '../src/dashboardComponentTitle';

test('source report changes and clearing update only source-derived titles', () => {
  assert.equal(sourceReportTitleUpdate('Chart', 'Chart', undefined, 'Leads by Source'), 'Leads by Source');
  assert.equal(sourceReportTitleUpdate('Leads by Source', 'Chart', 'Leads by Source', 'Pipeline'), 'Pipeline');
  assert.equal(sourceReportTitleUpdate('Pipeline', 'Chart', 'Pipeline', undefined), 'Chart');
  assert.equal(sourceReportTitleUpdate('My custom title', 'Chart', 'Leads by Source', 'Pipeline'), undefined);
});
