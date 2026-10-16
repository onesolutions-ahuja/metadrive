import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dashboardFilterValue,
  dashboardFiltersForObject,
  matchesDashboardFilters,
  toggleDashboardCrossFilter
} from '../src/dashboardFilters';
import type { DashboardFilterMetadata } from '../src/metadata';

const filters: DashboardFilterMetadata[] = [
  { id: 'stage', objectApiName: 'Opportunity', fieldApiName: 'StageName', operator: 'Equals', value: '' },
  { id: 'owner', objectApiName: 'Opportunity', fieldApiName: 'OwnerId', operator: 'Equals', value: 'owner-default' },
  { id: 'missing', objectApiName: 'Opportunity', fieldApiName: 'Name', operator: 'Is Null', value: '' },
  { id: 'other', objectApiName: 'Account', fieldApiName: 'Name', operator: 'Equals', value: 'Account default' }
];

test('dashboard filters apply a selected viewer value even when its saved default is blank', () => {
  const selected = dashboardFiltersForObject(filters, 'Opportunity', { stage: 'Qualification' });
  assert.deepEqual(selected.map(({ id, value }) => [id, value]), [
    ['stage', 'Qualification'],
    ['owner', 'owner-default'],
    ['missing', '']
  ]);
});

test('dashboard filter reset restores saved defaults and keeps null criteria active', () => {
  const reset = dashboardFiltersForObject(filters, 'Opportunity');
  assert.deepEqual(reset.map(({ id, value }) => [id, value]), [
    ['owner', 'owner-default'],
    ['missing', '']
  ]);
});

test('an explicitly cleared viewer selection overrides the saved default', () => {
  assert.equal(dashboardFilterValue(filters[1], { owner: '' }), '');
  assert.deepEqual(dashboardFiltersForObject(filters, 'Opportunity', { owner: '' })
    .map(({ id }) => id), ['missing']);
});

test('local widgets apply applicable dashboard filters with All/Any logic and viewer overrides', () => {
  const record = { StageName: 'Qualification', OwnerId: 'owner-default' };
  assert.equal(matchesDashboardFilters(record, filters, 'Opportunity', 'All'), true,
    'a blank saved filter default is ignored while a matching configured default remains active');
  assert.equal(matchesDashboardFilters(record, filters, 'Opportunity', 'All', {
    stage: 'Web',
    owner: 'another-owner'
  }), false, 'All requires every active viewer criterion to match');
  assert.equal(matchesDashboardFilters(record, filters, 'Opportunity', 'Any', {
    stage: 'Web',
    owner: 'owner-default'
  }), true, 'Any accepts a record matching one active viewer criterion');
  assert.equal(matchesDashboardFilters(record, filters, 'Opportunity', 'All', {
    other: 'An account value'
  }), true, 'filters for another object do not affect this widget');
});

test('chart cross-filter selections accumulate independently and toggle off on repeat selection', () => {
  const oneSelected = toggleDashboardCrossFilter([], 'chart-one', 'Lead', 'LeadSource', 'Web');
  const twoSelected = toggleDashboardCrossFilter(oneSelected, 'chart-one', 'Lead', 'LeadSource', 'Partner Referral');
  assert.deepEqual(twoSelected.map(({ value }) => value), ['Web', 'Partner Referral']);
  const otherChart = toggleDashboardCrossFilter(twoSelected, 'chart-two', 'Lead', 'LeadSource', 'Web');
  assert.equal(otherChart.length, 3, 'selections from different widgets remain independently removable');
  const deselected = toggleDashboardCrossFilter(otherChart, 'chart-one', 'Lead', 'LeadSource', 'Web');
  assert.deepEqual(deselected.map(({ componentId, value }) => [componentId, value]), [
    ['chart-one', 'Partner Referral'],
    ['chart-two', 'Web']
  ]);
});
