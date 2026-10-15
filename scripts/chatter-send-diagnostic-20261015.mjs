// Diagnostic only: no message sends, no credentials or customer content logged.
const root='https://metadrive-production.up.railway.app/api';
const email=process.env.METADRIVE_TEST_EMAIL,password=process.env.METADRIVE_TEST_PASSWORD;let token='';
if(!email||!password)throw Error('CI auth not configured');
async function api(path,method='GET',body){const r=await fetch(root+path,{method,headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});return {status:r.status,data:await r.json().catch(()=>({}))}}
const l=await api('/auth/login','POST',{email,password});if(l.status!==200||l.data.user?.tenantId!=='unesolutions-dev')throw Error('Unexpected tenant or login');token=l.data.access_token;
const [grants,flows,pages,records]=await Promise.all([api('/chatter/access'),api('/metadata/flows'),api('/metadata/pages'),api('/records/Communication_Records__c?limit=200')]);
const send=flows.data.flows?.find(x=>x.apiName==='CHATTER_SEND_MESSAGE');
const page=pages.data.pages?.find(x=>x.apiName==='UNE_CHATTER');
const component=page?.components?.find(x=>x.type==='Custom:ChatterInbox');
const rows=records.data.records||[];
const valid=rows.filter(x=>String(x.Communication_Mode__c||'').toLowerCase()==='whatsapp'&&String(x.Event_Type__c||'').toLowerCase()==='message');
const output={
 isSupportPrincipal:String(email).toLowerCase()==='support@unesolutions.co.uk',role:l.data.user?.role,
 endpoints:{grants:grants.status,flows:flows.status,pages:pages.status,records:records.status},
 grants:(grants.data.grants||[]).map(g=>({read:g.canRead,send:g.canSend,assign:g.canAssign,viewAll:g.viewAll})),
 page:{status:page?.status,componentConfigured:!!component,sendBinding:component?.properties?.actionFlows?.send,configuredCanSend:component?.properties?.canSend},
 sendFlow:{status:send?.status,activeVersion:send?.activeVersion,inputNames:send?.resources?.filter(x=>x.availableForInput).map(x=>x.name)},
 records:{readable:rows.length,whatsapp:valid.length,withAccount:valid.filter(x=>x.Channel_Account__c).length}
};
console.log('CHATTER_SEND_DIAGNOSTIC '+JSON.stringify(output));
