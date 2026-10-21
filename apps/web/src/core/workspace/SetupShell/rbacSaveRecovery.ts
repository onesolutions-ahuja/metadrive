import type {AccessControlMetadata} from '../../metadata/Definitions/metadata';

const nonUserSections=[
  'profiles','permissionSets','permissionSetGroups','roles','publicGroups',
  'queues','sharingRules','sharingSettings'
] as const;

function comparableUser(user:AccessControlMetadata['users'][number]) {
  return {
    id:user.id,
    roleId:user.roleId,
    profileId:user.profileId,
    timeZone:user.timeZone,
    locale:user.locale,
    currencyIsoCode:user.currencyIsoCode??'',
    userType:user.userType,
    externalAccountId:user.externalAccountId??'',
    permissionSetIds:[...user.permissionSetIds].sort(),
    permissionSetGroupIds:[...user.permissionSetGroupIds].sort()
  };
}

/**
 * Only reconcile a timed-out RBAC save as successful when it exclusively
 * changed User settings, the committed revision advanced, and every editable
 * User setting/assignment matches SQL. Never infer success from revision alone.
 */
export function rbacUserSaveWasCommitted(
  before:AccessControlMetadata,
  draft:AccessControlMetadata,
  stored:AccessControlMetadata
):boolean {
  if(stored.tenantId!==draft.tenantId||stored.revision<=draft.revision)return false;
  if(nonUserSections.some(key=>JSON.stringify(before[key])!==JSON.stringify(draft[key])))return false;
  const normalized=(users:AccessControlMetadata['users'])=>JSON.stringify(
    users.map(comparableUser).sort((a,b)=>a.id.localeCompare(b.id)));
  return normalized(draft.users)===normalized(stored.users);
}
