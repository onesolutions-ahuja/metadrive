import {readFileSync,writeFileSync} from 'node:fs';
const filename='apps/server/src/index.ts';
let source=readFileSync(filename,'utf8');
const edits=[["    res.locals.principal = {\n      userId: user.id,","    // Portal identities have a deliberately narrow route allowlist, separate\n    // from role and object permissions. They cannot reach Setup, credentials,\n    // sharing administration, Flows, reports, or record mutation endpoints.\n    const accessMetadataUser = state.tenants[tenantId].accessControl.users\n      .find((member) => member.id === user.id);\n    if (accessMetadataUser?.userType === 'external') {\n      const portalRecordRead = req.method === 'GET' &&\n        /^\\/api\\/records\\/[A-Za-z0-9_]+(?:\\/[A-Za-z0-9_-]+)?$/.test(req.path);\n      if (!(portalRecordRead || (req.method === 'GET' && req.path === '/api/auth/me'))) {\n        res.status(403).json({ error: 'External identities cannot use this tenant API' });\n        return;\n      }\n    }\n    res.locals.principal = {\n      userId: user.id,"],["  const identitiesByEmail = new Map(state.users","  const invalidExternalUser = parsed.data.users.find((member) =>\n    member.userType === 'external' &&\n    (!member.externalAccountId ||\n      !(tenant.records.Account ?? []).some((record) => record.Id === member.externalAccountId)));\n  if (invalidExternalUser)\n    return res.status(400).json({ error: 'External identity requires a tenant-local account boundary' });\n  const identitiesByEmail = new Map(state.users"]];
for(const [before,after] of edits){
  if(source.includes(after)) continue;
  const count=source.split(before).length-1;
  if(count!==1) throw Error('Unsafe portal patch anchor count '+count);
  source=source.replace(before,after);
}
writeFileSync(filename,source);
console.log('Phase4 portal isolation successfully patched');