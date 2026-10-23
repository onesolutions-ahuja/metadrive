#!/usr/bin/env node
// Read-only public DNS diagnostics: no credentials, email contents, or production mutations.
import dns from 'node:dns/promises';

const domain='unesolutions.co.uk';
const oracleIp='132.145.18.46';
const records={};
async function lookup(label,fn){
 try {const value=await fn();records[label]={status:'ok',value};}
 catch(error){records[label]={status:error?.code??'error',value:[]};}
}
await Promise.all([
 lookup('mx',()=>dns.resolveMx(domain)),
 lookup('apexA',()=>dns.resolve4(domain)),
 lookup('mailA',()=>dns.resolve4('mail.'+domain)),
 lookup('apiA',()=>dns.resolve4('api.'+domain)),
 lookup('spfTxt',async()=> (await dns.resolveTxt(domain)).map(x=>x.join('')).filter(x=>x.toLowerCase().startsWith('v=spf1'))),
 lookup('dmarcTxt',async()=> (await dns.resolveTxt('_dmarc.'+domain)).map(x=>x.join('')).filter(x=>x.toLowerCase().startsWith('v=dmarc1'))),
 lookup('ptr',()=>dns.reverse(oracleIp)),
 lookup('ns',()=>dns.resolveNs(domain))
]);
for(const [label,value] of Object.entries(records))
 console.log('PUBLIC DNS '+label+': '+JSON.stringify(value));
const mx=records.mx?.value??[];
const mailIp=records.mailA?.value??[];
console.log('Incoming MX target uses this Oracle VM: '+mx.some(item=>String(item.exchange).toLowerCase().replace(/\.$/,'')==='mail.'+domain)&&mailIp.includes(oracleIp));
console.log('Oracle VM IP is configured as mail host: '+mailIp.includes(oracleIp));
console.log('PUBLIC DNS audit finished (no sensitive data, no changes)');
