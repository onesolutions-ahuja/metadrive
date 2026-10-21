// Production release preflight: verify the SQL API and the real frontend origin.
const base='https://metadrive-nxd7.onrender.com';
const origin='https://unesolutions.co.uk';
const timeout=AbortSignal.timeout(30000);
const health=await fetch(base+'/api/health',{signal:timeout,cache:'no-store'});
if(!health.ok)throw new Error('Render SQL health unavailable: HTTP '+health.status);
const payload=await health.json();
if(payload.status!=='ok'||payload.persistence!=='sql')throw new Error('Render API returned an unhealthy SQL result');
const preflight=await fetch(base+'/api/health',{
  method:'OPTIONS',
  headers:{Origin:origin,'Access-Control-Request-Method':'GET'},
  signal:AbortSignal.timeout(30000)
});
if(preflight.status!==204 || preflight.headers.get('access-control-allow-origin')!==origin)
  throw new Error('Render API blocks production frontend origin: HTTP '+preflight.status);
console.log('Render SQL API and production browser CORS verified');
