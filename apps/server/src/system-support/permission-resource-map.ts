/** UI permission names are labels for central RBAC resource/action pairs.
 * The evaluator continues to receive one canonical SQL resource/action contract. */
export const systemPermissionBindings: Readonly<Record<string, readonly [string,string]>> = {
  'metadata:read':['ObjectDefinition','read'],
  'metadata:write':['ObjectDefinition','create'],
  'security:read':['Security','read'],
  'security:manage':['Security','manage'],
  'objects:manage':['ObjectDefinition','manage'],
  'fields:create':['FieldDefinition','create'],
  'fields:delete':['FieldDefinition','delete'],
  'flows:manage':['FlowDefinition','manage'],
  'flows:run':['Flow','execute'],
  'flows:system-context':['FlowDefinition','system-context'],
  'namedCredentials:manage':['NamedCredential','manage'],
  'email:send':['Email','send'],
  'callouts:execute':['NamedCredential','execute'],
  'notifications:send':['Notification','send'],
  'approvals:manage':['ApprovalRequest','manage'],
  'reports:manage':['SystemDefinition:reports','manage'],
  'pages:manage':['PageDefinition','manage'],
  'components:manage':['ComponentDefinition','create'],
  'dashboards:manage':['SystemDefinition:dashboards','manage'],
  'dashboards:viewTeam':['SystemDefinition:dashboards','read'],
  'data:viewAll':['Record','viewAll']
};
const reverse = new Map(Object.entries(systemPermissionBindings).map(([key,[resource,action]])=>[resource+':'+action,key]));
export function toPermissionRule(key:string):{resource:string;action:string} {
  if(key==='*:*')return {resource:'*',action:'*'};
  const known=systemPermissionBindings[key];
  if(known)return {resource:known[0],action:known[1]};
  const at=key.lastIndexOf(':');
  if(at<1||at===key.length-1)throw Error('Invalid system permission');
  const resource=key.slice(0,at),action=key.slice(at+1);
  if(!/^[A-Za-z][A-Za-z0-9_:.-]*$/.test(resource)||!/^[A-Za-z][A-Za-z0-9_]*$/.test(action))
    throw Error('Invalid system permission');
  return {resource,action};
}
export function toDisplayedPermission(resource:string,action:string):string {
  return reverse.get(resource+':'+action)??resource+':'+action;
}
