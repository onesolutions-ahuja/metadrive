import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
function publicIp(address:string){
 const kind=isIP(address);
 if(kind===4){
  const octets=address.split('.').map(Number),[a,b,c]=octets;
  if(a===0||a===10||a===127||a>=224||a===169&&b===254||
     a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||
     a===192&&b===0||a===192&&b===0&&c===2||
     a===198&&b>=18&&b<=19||a===198&&b===51&&c===100||
     a===203&&b===0&&c===113)return false;
  return true;
 }
 if(kind===6){
  const value=address.toLowerCase();
  // Only permit global IPv6 unicast. Reject mapped IPv4, ULA, loopback,
  // link-local, multicast and documentation ranges.
  return /^[23][0-9a-f]/.test(value)&&!value.startsWith('2001:db8:');
 }
 return false;
}
export async function publicConnectionAddress(host:string){
 if(!host||host.length>253||host==='localhost'||host.endsWith('.localhost'))
  throw new Error('Invalid connection destination');
 const records=await lookup(host,{all:true,verbatim:true});
 if(!records.length||records.some(r=>!publicIp(r.address)))
  throw new Error('Invalid connection destination');
 return records[0];
}
