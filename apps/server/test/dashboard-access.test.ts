import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canAccessDashboard,
  canEditDashboard,
  dashboardFolderAccessLevel,
  matchesDashboardFilters,
  type DashboardFolder,
  type DashboardSharing
} from '../src/dashboard-access.js';

const privateDashboard: DashboardSharing = {
  ownerUserId: 'owner',
  visibility: 'Private',
  status: 'Deployed',
  sharedUserIds: ['shared-user'],
  sharedPermissionSetGroupIds: ['sales-team']
};

test('private dashboard access is granted only to owner, explicit shares, and administrators', () => {
  assert.equal(canAccessDashboard(privateDashboard, 'owner', [], false), true);
  assert.equal(canAccessDashboard(privateDashboard, 'shared-user', [], false), true);
  assert.equal(canAccessDashboard(privateDashboard, 'group-member', ['sales-team'], false), true);
  assert.equal(canAccessDashboard(privateDashboard, 'administrator', [], true), true);
  assert.equal(canAccessDashboard(privateDashboard, 'unshared-user', [], false), false);
});

test('tenant-wide dashboards are readable to authenticated metadata readers', () => {
  assert.equal(canAccessDashboard({ ...privateDashboard, visibility: 'All Users' }, 'any-user', [], false), true);
});

test('unrelated group memberships do not grant access', () => {
  assert.equal(canAccessDashboard(privateDashboard, 'unshared-user', ['support-team'], false), false);
});

test('nested dashboard folders inherit the strongest user, public group, role, and subordinate grants', () => {
  const folders: DashboardFolder[] = [
    {
      id: 'parent',
      parentFolderId: null,
      ownerUserId: 'folder-owner',
      shares: [{ targetType: 'PublicGroup', targetId: 'sales-group', accessLevel: 'Viewer' }]
    },
    {
      id: 'child',
      parentFolderId: 'parent',
      ownerUserId: 'folder-owner',
      shares: [{ targetType: 'RoleAndSubordinates', targetId: 'manager-role', accessLevel: 'Editor' }]
    },
    {
      id: 'grandchild',
      parentFolderId: 'child',
      ownerUserId: 'folder-owner',
      shares: [{ targetType: 'User', targetId: 'viewer', accessLevel: 'Manager' }]
    }
  ];
  const context = {
    userId: 'rep',
    roleId: 'rep-role',
    roles: [
      { id: 'exec-role', parentRoleId: null },
      { id: 'manager-role', parentRoleId: 'exec-role' },
      { id: 'rep-role', parentRoleId: 'manager-role' }
    ],
    publicGroups: [{
      id: 'sales-group', userIds: [], roleIds: [], roleAndSubordinateIds: ['exec-role'], groupIds: []
    }]
  };
  assert.equal(dashboardFolderAccessLevel('grandchild', folders, context), 'Editor');
  assert.equal(dashboardFolderAccessLevel('parent', folders, context), 'Viewer');
  assert.equal(dashboardFolderAccessLevel('parent', folders, { ...context, userId: 'outsider', roleId: undefined }), null);
  assert.equal(dashboardFolderAccessLevel('grandchild', folders, {
    ...context, userId: 'viewer', roleId: undefined
  }), 'Manager');
  assert.equal(dashboardFolderAccessLevel('child', folders, {
    ...context, userId: 'outsider', roleId: undefined
  }), null);
});

test('folder access grants dashboard viewing and editor-level changes without changing dashboard-level shares', () => {
  const folderViewer = { ...privateDashboard, folderAccessLevel: 'Viewer' as const };
  const folderEditor = { ...privateDashboard, folderAccessLevel: 'Editor' as const };
  assert.equal(canAccessDashboard(folderViewer, 'folder-viewer', [], false), true);
  assert.equal(canEditDashboard(folderViewer, 'folder-viewer', false), false);
  assert.equal(canEditDashboard(folderEditor, 'folder-editor', false), true);
  assert.equal(canEditDashboard(privateDashboard, 'unshared-user', false), false);
});

test('permission-set-group and territory folder grants follow current memberships and subordinate territories', () => {
  const folders: DashboardFolder[] = [{
    id: 'shared',
    parentFolderId: null,
    ownerUserId: 'owner',
    shares: [
      { targetType: 'PermissionSetGroup', targetId: 'sales-psg', accessLevel: 'Editor' },
      { targetType: 'Territory', targetId: 'north', accessLevel: 'Viewer' }
    ]
  }];
  const context = {
    userId: 'child-territory-user',
    roleId: undefined,
    permissionSetGroupIds: [],
    roles: [],
    publicGroups: [],
    territories: [
      { id: 'north', parentTerritoryId: null, userIds: [] },
      { id: 'north-west', parentTerritoryId: 'north', userIds: ['child-territory-user'] },
      { id: 'south', parentTerritoryId: null, userIds: ['unrelated-user'] }
    ]
  };
  assert.equal(dashboardFolderAccessLevel('shared', folders, context), 'Viewer');
  assert.equal(dashboardFolderAccessLevel('shared', folders, {
    ...context, userId: 'psg-user', permissionSetGroupIds: ['sales-psg']
  }), 'Editor');
  assert.equal(dashboardFolderAccessLevel('shared', folders, {
    ...context, userId: 'unrelated-user'
  }), null, 'users in a separate territory are not included in a territory grant');
  assert.equal(dashboardFolderAccessLevel('shared', folders, {
    ...context, userId: 'parent-only-user', territories: [
      { id: 'north', parentTerritoryId: null, userIds: ['parent-only-user'] },
      { id: 'north-west', parentTerritoryId: 'north', userIds: [] }
    ]
  }), 'Viewer', 'parent territory members receive access to the parent grant');
});

test('draft dashboards are hidden from shared users until published', () => {
  const draft = { ...privateDashboard, status: 'Draft' as const };
  assert.equal(canAccessDashboard(draft, 'owner', [], false), true);
  assert.equal(canAccessDashboard(draft, 'shared-user', [], false), false);
  assert.equal(canAccessDashboard({ ...draft, visibility: 'All Users' }, 'any-user', [], false), false);
  assert.equal(canAccessDashboard(draft, 'administrator', [], true), true);
});

test('dashboard filters support all and any logic while an empty set matches all records', () => {
  const filters = ['open', 'large'];
  const matches = (filter: string) => filter === 'open';
  assert.equal(matchesDashboardFilters(filters, 'All', matches), false);
  assert.equal(matchesDashboardFilters(filters, 'Any', matches), true);
  assert.equal(matchesDashboardFilters([], 'Any', matches), true);
});
