export function postgresConnectionOptions(connectionString,env=process.env) {
  const url=new URL(connectionString);
  if(!['postgres:','postgresql:'].includes(url.protocol))throw Error('Expected PostgreSQL DATABASE_URL');
  const local=['localhost','127.0.0.1','::1'].includes(url.hostname);
  if(env.PGSSLMODE==='disable'&&!local)throw Error('Unencrypted remote PostgreSQL access is not allowed');
  for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
  const ssl=env.PGSSLMODE==='disable'?false:{
    rejectUnauthorized:env.METADRIVE_DB_ALLOW_SELF_SIGNED_CERT!=='true',
    ...(env.METADRIVE_DB_CA_CERT?{ca:env.METADRIVE_DB_CA_CERT.replace(/\\n/g,'\n')}:{})
  };
  return {connectionString:url.toString(),ssl,connectionTimeoutMillis:15000};
}
