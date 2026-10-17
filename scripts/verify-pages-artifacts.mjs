import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const dist = resolve('apps/web/dist');
for (const file of ['index.html', '404.html', 'component-sandbox.js']) {
  if (!existsSync(resolve(dist,file))) throw new Error('Missing release asset: '+file);
}
const html=readFileSync(resolve(dist,'index.html'),'utf8');
const fallback=readFileSync(resolve(dist,'404.html'),'utf8');
if (!html.includes('<html') || !fallback.includes('<html')) throw new Error('Invalid HTML entrypoint');
const refs=[...html.matchAll(/(?:src|href)=[\"']([^\"']+\.(?:js|css))[\"']/g)].map(x=>x[1]);
if (!refs.length) throw new Error('No JS or CSS bundle references');
for(const ref of refs) {
 const asset=resolve(dist,ref.replace(/^\//,''));
 if (!asset.startsWith(dist+'/') || !existsSync(asset)) throw new Error('Missing linked asset: '+ref);
}
if (!readdirSync(resolve(dist,'assets')).some(x=>x.endsWith('.js'))) throw new Error('No JavaScript generated');
if (process.argv.includes('--live')) {
 const host=(process.env.METADRIVE_PAGES_URL||'https://unesolutions.co.uk').replace(/\/$/,'');
 const response=await fetch(host+'/login',{cache:'no-store',signal:AbortSignal.timeout(15000)});
 if (!response.ok) throw new Error('Deployed login unavailable: HTTP '+response.status);
 const page=await response.text();
 if (!page.includes('<html')) throw new Error('Deployed login is not HTML');
 const names=refs.filter(x=>x.endsWith('.js')).map(x=>x.split('/').at(-1));
 if (!names.length || names.some(name=>!page.includes(name))) throw new Error('Live bundle differs from published build');
}
console.log('Pages build verified'+(process.argv.includes('--live')?' live':''));
