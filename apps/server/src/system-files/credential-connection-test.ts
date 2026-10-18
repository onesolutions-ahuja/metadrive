import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import https from 'node:https';
import nodemailer from 'nodemailer';
function unsafeAddress(address:string){
 const ip=address.toLowerCase();
 if(isIP(ip)===4){
  const p=ip.split('.').map(Number);
  return p[0]===0||p[0]===10||p[0]===127||p[0]>=224||p[0]===169&&p[1]===254||
   p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===192&&p[1]===168||
   p[0]===100&&p[1]>=64&&p[1]<=127||p[0]===198&&p[1]>=18&&p[1]<=19;
 }
 if(isIP(ip)===6){
  if(ip.includes('.')&&ip.includes('ffff'))return true;
  return ip==='::'||ip==='::1'||ip.startsWith('fc')||ip.startsWith('fd')||
   ip.startsWith('fe8')||ip.startsWith('fe9')||ip.startsWith('fea')||
   ip.startsWith('feb')||ip.startsWith('ff')||ip.startsWith('2001:db8');
 }
 return true;
}
/** Explicit host approval and pinned public DNS resolution prevent SSRF through tenant metadata. */
export async function approvedCredentialEndpoint(raw:string,protocol:'HTTPS'|'SMTP'){
 const parsed=new URL(raw);
 const schemes=protocol==='HTTPS'?['https:']:['smtp:','smtps:'];
 if(!schemes.includes(parsed.protocol)||parsed.username||parsed.password||!parsed.hostname
   ||isIP(parsed.hostname)||!parsed.hostname.includes('.')
   ||/\.(?:local|internal|localhost|invalid|test|example)$/.test(parsed.hostname))
  throw Error('Unsafe credential endpoint');
 const host=parsed.hostname.toLowerCase(),port=Number(parsed.port||(protocol==='HTTPS'?'443':parsed.protocol==='smtps:'?'465':'587'));
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid credential port');
 const allowed=(process.env.METADRIVE_OUTBOUND_ALLOWED_HOSTS??'').split(',')
  .map(s=>s.trim().toLowerCase()).filter(Boolean);
 if(!allowed.includes(host)&&!allowed.includes(host+':'+port))
  throw Error('Credential host must be approved in the server outbound allowlist');
 const addresses=await lookup(host,{all:true,verbatim:true});
 if(!addresses.length||addresses.some(a=>unsafeAddress(a.address)))
  throw Error('Credential DNS resolves to a non-public address');
 return {url:parsed,address:addresses[0].address,hostname:host,port};
}
export async function testHttpsCredential(raw:string,authType:string,secret:string|null,headerName:string){
 const e=await approvedCredentialEndpoint(raw,'HTTPS');
 const headers:Record<string,string>={Host:e.url.host};
 if(secret){
  if(authType==='Bearer')headers.Authorization='Bearer '+secret;
  else if(authType==='Basic')headers.Authorization='Basic '+Buffer.from(secret).toString('base64');
  else if(authType==='API Key'){
   if(!/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(headerName))throw Error('Invalid credential header');
   headers[headerName]=secret;
  }else if(authType!=='None')throw Error('OAuth credentials require a verified token provider');
 }
 const status=await new Promise<number>((resolve,reject)=>{
  const req=https.request({hostname:e.address,port:e.port,servername:e.hostname,
    method:'GET',path:e.url.pathname+e.url.search,headers,rejectUnauthorized:true},
    res=>{res.resume();res.on('end',()=>resolve(res.statusCode??0));});
  req.on('error',reject);req.setTimeout(5000,()=>req.destroy(new Error('Credential connection timeout')));
  req.end();
 });
 return {connected:status>=200&&status<400,status,message:status>=200&&status<400?'HTTPS connection successful':'HTTPS request rejected'};
}
export async function testSmtpCredential(raw:string,configuration:Record<string,string>,secret:string|null){
 const e=await approvedCredentialEndpoint(raw,'SMTP');
 const username=configuration.username??configuration.user;
 const password=secret??configuration.password;
 const transport=nodemailer.createTransport({
  host:e.address,port:e.port,secure:e.url.protocol==='smtps:',
  requireTLS:e.url.protocol==='smtp:',tls:{servername:e.hostname,rejectUnauthorized:true},
  connectionTimeout:5000,greetingTimeout:5000,socketTimeout:8000,
  ...(username&&password?{auth:{user:username,pass:password}}:{})
 });
 try{await transport.verify();return {connected:true,message:'SMTP connection successful'};}
 finally{transport.close();}
}
