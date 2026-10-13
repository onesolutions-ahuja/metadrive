import { readFileSync, writeFileSync } from 'node:fs';
const f='apps/server/src/index.ts';let s=readFileSync(f,'utf8');
function change(a,b){const c=s.split(a).length-1;if(c!==1)throw Error('Recovery Flow integration anchor mismatch ('+c+'): '+a.slice(0,95));s=s.replace(a,b)}
change("import { normalizeRecoveryPolicy, renderRecoveryTemplate, deliverWithFallback } from './recovery-policy.js';",
"import { normalizeRecoveryPolicy, renderRecoveryTemplate, deliverWithFallback } from './recovery-policy.js';\nimport { RECOVERY_FLOW_API, defaultRecoveryFlowDefinition, recoveryFlowActions, type RecoveryStage } from './recovery-flow.js';");
change("objects, flows: [flow, whatsappRouterFlow(), whatsappContextFlow(), ...connectorAppCatalog.flows]",
"objects, flows: [flow, flowSchema.parse(defaultRecoveryFlowDefinition()), whatsappRouterFlow(), whatsappContextFlow(), ...connectorAppCatalog.flows]");
change("flows: [...tenant.flows,\n        ...connectorAppCatalog.flows.filter",
"flows: [...tenant.flows,\n        ...(tenant.flows.some((f) => f.apiName === RECOVERY_FLOW_API) ? [] : [flowSchema.parse(defaultRecoveryFlowDefinition())]),\n        ...connectorAppCatalog.flows.filter");
const before="app.post('/api/auth/password-reset/request', async (req: Request, res: Response) => {";
const after=`function protectedRecoveryStage(tenant: TenantData, stage: RecoveryStage) {
  const flow = tenant.flows.find((item) => item.apiName === RECOVERY_FLOW_API);
  // The protected default is available to older tenants even before migration.
  const published = flow ? activeFlowDefinition(flow) : undefined;
  if (flow && !published) throw new Error('Protected recovery flow must remain published.');
  return recoveryFlowActions(published ?? defaultRecoveryFlowDefinition(), stage);
}
`+before;
change(before,after);
change("  const { smtpCredentialId, fromEmail } = tenant.passwordRecovery;\n  const policy = normalizeRecoveryPolicy(tenant.passwordRecovery.policy);",
"  const { smtpCredentialId, fromEmail } = tenant.passwordRecovery;\n  const policy = normalizeRecoveryPolicy(tenant.passwordRecovery.policy);\n  let flowActions: ReturnType<typeof protectedRecoveryStage>;\n  try { flowActions = protectedRecoveryStage(tenant, 'request'); }\n  catch { console.warn('Protected recovery Flow is invalid'); return res.status(202).json(response); }\n  const generateConfig = flowActions[0].config;\n  const sendConfig = flowActions[1].config;\n  if (generateConfig.method === 'OTP' || generateConfig.method === 'LINK') policy.method = generateConfig.method;\n  if (sendConfig.channel !== 'email') return res.status(202).json(response);");
change("  const template = policy.templates.email;\n  const variables = {",
"  const template = policy.templates.email;\n  // The tenant's published recovery Flow can override the inherited email template.\n  if (sendConfig.templateSource === 'FLOW') {\n    if (typeof sendConfig.subject === 'string' && sendConfig.subject.length <= 240) template.subject = sendConfig.subject;\n    if (typeof sendConfig.body === 'string' && sendConfig.body.length <= 4000) template.body = sendConfig.body;\n  }\n  const variables = {");
change("  if (!valid || !user) return res.status(400).json({ error: 'Invalid or expired password-reset link' });",
"  if (!valid || !user) return res.status(400).json({ error: 'Invalid or expired password-reset code or link' });\n  // The tenant's published Flow cannot bypass verification or omit password/session revocation.\n  protectedRecoveryStage(tenantData(user.tenantId)!, 'confirm');");
writeFileSync(f,s);console.log('Connected restricted recovery Flow metadata to OTP/link request and confirm endpoints');
