import { createHash } from 'node:crypto';
/** Identity-independent provisioning policy for a virtual, tenant-owned kiosk login. */
export function kioskDeviceIdentity(tenantId, index) {
  if (typeof tenantId !== 'string' || !/^[a-z0-9][a-z0-9_-]{1,62}$/i.test(tenantId)) throw Error('Invalid tenant');
  if (!Number.isInteger(index) || index < 1 || index > 999) throw Error('Invalid kiosk number');
  // .invalid is reserved; no mailbox can be accidentally contacted.
  const raw = tenantId.toLowerCase();
  const domain = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(raw)
    ? raw : raw.replace(/[^a-z0-9-]/g,'-').slice(0,42).replace(/-+$/,'')
      + '-' + createHash('sha256').update(raw).digest('hex').slice(0,12);
  return 'kiosk'+index+'@'+domain+'.invalid';
}
export function prepareKioskDevice(tenant, kioskEmail, id, createdAt) {
  if (!tenant?.accessControl?.profiles?.some(p => p.id === 'kiosk-user')) throw Error('Install and activate Kiosk first');
  if ((tenant.accessControl.users ?? []).some(u => u.username.toLowerCase() === kioskEmail.toLowerCase())) {
    throw Error('This kiosk login already exists');
  }
  return {
    ...tenant,
    accessControl: {
      ...tenant.accessControl,
      users: [...(tenant.accessControl.users ?? []), {
        id, name:'Kiosk Device',username:kioskEmail,role:'Kiosk',
        roleId:(tenant.accessControl.roles ?? []).find(r=>r.id==='role-standard-user')?.id
          ?? (tenant.accessControl.roles ?? [])[0]?.id,
        profileId:'kiosk-user',permissionSetIds:[],permissionSetGroupIds:[],
        timeZone:'Europe/London',locale:'en-GB'
      }]
    }
  };
}
