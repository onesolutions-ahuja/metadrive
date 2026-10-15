const base = process.env.METADRIVE_API_BASE ?? 'https://metadrive-production.up.railway.app';
const email = process.env.METADRIVE_TEST_EMAIL;
const password = process.env.METADRIVE_TEST_PASSWORD;
if (!email || !password) throw Error('Missing authenticated CI login secrets');
async function call(path, token, method='GET', body) {
  const response = await fetch(base + path, {
    method,
    headers: {'content-type': 'application/json', ...(token ? {authorization: 'Bearer ' + token} : {})},
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000)
  });
  const data = await response.json().catch(() => ({}));
  return {status: response.status, data};
}
const login = await call('/api/auth/login', null, 'POST', {email, password});
if (login.status !== 200 || typeof login.data.access_token !== 'string') throw Error('Chatter audit login HTTP ' + login.status);
const token = login.data.access_token;
const result = {};
for (const [key,path] of Object.entries({
  pages:'/api/metadata/pages', flows:'/api/metadata/flows', objects:'/api/metadata/objects',
  credentials:'/api/named-credentials', apps:'/api/metadata/apps'
})) {
  const reply = await call(path, token);
  const data = reply.data;
  result[key] = {status:reply.status};
  if (key === 'pages') result[key].chatter = (data.pages || []).filter(x => /CHATTER/i.test(x.apiName)).map(x => ({apiName:x.apiName,status:x.status,pageType:x.pageType,layoutMode:x.layoutMode}));
  if (key === 'flows') result[key].chatter = (data.flows || []).filter(x => /CHATTER|WA_ROUTER/i.test(x.apiName)).map(x => ({apiName:x.apiName,status:x.status,activeVersion:x.activeVersion}));
  if (key === 'objects') result[key].communicationFields = (data.objects || []).find(x => x.apiName === 'Communication_Records__c')?.fields?.map(x => x.apiName) ?? [];
  if (key === 'credentials') result[key].whatsAppCount = (data.credentials || []).filter(x => /whatsapp/i.test(String(x.name) + ' ' + String(x.label))).length;
  if (key === 'apps') result[key].names = (data.apps || []).filter(x => /communication|chatter/i.test(x.apiName + ' ' + x.label)).map(x => x.apiName);
}
console.log('CHatter metadata audit (no secrets):', JSON.stringify(result));
