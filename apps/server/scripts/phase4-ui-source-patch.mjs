import {readFileSync,writeFileSync} from 'node:fs';
const edits=[{"path":"apps/server/src/index.ts","before":"? { ...tenant.accessControl, sharingSettings: tenant.sharingSettings }","after":"? { ...tenant.accessControl, sharingSettings: tenant.sharingSettings, tenantId: getPrincipal(res).tenantId }"},{"path":"apps/web/src/App.tsx","before":"<p className=\"permission-help\">Private records are visible to their owner and users with explicit sharing or View All/Modify All access. Object and field permissions still apply.</p>","after":"<p className=\"permission-help\">Private records are visible to their owner and users with explicit sharing or View All/Modify All access. Object and field permissions still apply.</p>\n          {visibleSharingObjects.length > 0 && (() => {\n            const object = visibleSharingObjects.find((item) => item.apiName === selectedId) ?? visibleSharingObjects[0];\n            const setting = draft.sharingSettings[object.apiName] ?? {\n              defaultAccess: 'Private' as const, grantAccessUsingHierarchies: true\n            };\n            return <AdvancedSharingSettings tenantId={draft.tenantId ?? ''} object={object}\n              setting={setting} users={draft.users} roles={draft.roles}\n              onChange={(next) => setDraft((current) => ({\n                ...current, sharingSettings: { ...current.sharingSettings, [object.apiName]: next }\n              }))} />;\n          })()}"},{"path":"apps/web/src/App.tsx","before":"placeholder=\"USD\" /></label><h3 className=\"permission-section-heading\">Permission Sets</h3>","after":"placeholder=\"USD\" /></label><label className=\"form-label\">User Type\n          <select className=\"form-control\" value={user.userType ?? 'internal'}\n            onChange={(event) => patchUser(user.id, {\n              userType: event.target.value as 'internal' | 'external',\n              externalAccountId: event.target.value === 'external' ? user.externalAccountId : undefined\n            })}>\n            <option value=\"internal\">Internal</option><option value=\"external\">External portal</option>\n          </select></label>\n          {user.userType === 'external' && <label className=\"form-label\">Verified tenant Account ID\n            <input className=\"form-control\" value={user.externalAccountId ?? ''}\n              onChange={(event) => patchUser(user.id, { externalAccountId: event.target.value })}\n              placeholder=\"Tenant account record ID\" />\n          </label>}<h3 className=\"permission-section-heading\">Permission Sets</h3>"}];
let changed=0;
for(const {path,before,after} of edits){
 let file=readFileSync(path,'utf8');
 if(file.includes(after))continue;
 const count=file.split(before).length-1;
 if(count!==1)throw Error('Unsafe Phase4 UI patch '+path+' matched '+count);
 file=file.replace(before,after);
 writeFileSync(path,file);changed++;
}
const ui='apps/web/src/App.tsx';
let app=readFileSync(ui,'utf8');
if(!app.includes("import AdvancedSharingSettings from './AdvancedSharingSettings';")){
 app="import AdvancedSharingSettings from './AdvancedSharingSettings';\n"+app;
 writeFileSync(ui,app);changed++;
}
console.log(JSON.stringify({phase4UiPatched:changed}));