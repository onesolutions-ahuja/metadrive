import https from 'node:https';
import {publicConnectionAddress} from './public-connection-address.js';
export async function probePublicHttps(urlText:string,headers:Record<string,string>={}){
 const url=new URL(urlText);
 if(url.protocol!=='https:'||url.username||url.password||url.hash||!url.hostname)
  throw new Error('Invalid HTTPS endpoint');
 const address=await publicConnectionAddress(url.hostname);
 const status=await new Promise<number>((resolve,reject)=>{
  const req=https.request(url,{method:'HEAD',headers,timeout:8000,rejectUnauthorized:true,
   lookup:(_host,_options,callback)=>callback(null,address.address,address.family)},
  res=>{res.resume();resolve(res.statusCode??0);});
  req.once('timeout',()=>req.destroy(new Error('Connection timed out')));
  req.once('error',reject);
  req.end();
 });
 return {connected:status>=200&&status<400,status,
  message:status>=200&&status<400?'Endpoint reached successfully':'Remote endpoint rejected the connection test'};
}
