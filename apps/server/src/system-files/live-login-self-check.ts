import {AuthenticationService} from './authentication.js';
import type {SqlPersistence} from './sql-persistence.js';

export async function verifyLiveBootstrapLogin(db:SqlPersistence,port:number,env:NodeJS.ProcessEnv=process.env) {
  if(env.METADRIVE_LOGIN_SELF_CHECK!=='true')return;
  const email=env.METADRIVE_BOOTSTRAP_ADMIN_EMAIL;
  const password=env.METADRIVE_BOOTSTRAP_ADMIN_PASSWORD;
  const domain=env.METADRIVE_BOOTSTRAP_DOMAIN;
  if(!email||!password||!domain){console.error('Bootstrap login self-check: missing configuration');return;}
  const auth=new AuthenticationService(db);
  const {rows}=await db.query<{password_hash:string}>(
    `SELECT u.password_hash FROM md_users u
     JOIN md_tenant_domains d ON d.tenant_id=u.tenant_id
     WHERE lower(u.email)=lower($1) AND d.domain=$2 AND u.enabled=true`,[email,domain]);
  const user=rows[0];
  const rawMatch=user?await auth.verifyPassword(password,user.password_hash):false;
  const trimmedMatch=user?await auth.verifyPassword(password.trim(),user.password_hash):false;
  const base='http://127.0.0.1:'+port;
  let status=0,logoutStatus=0;
  const response=await fetch(base+'/api/auth/login?landing=1',{
    method:'POST',headers:{origin:'https://'+domain,'content-type':'application/json'},
    body:JSON.stringify({email,password}),signal:AbortSignal.timeout(12000)
  });
  status=response.status;
  if(status===200){
    const data=await response.json() as {access_token?:string};
    const cookie=response.headers.get('set-cookie')?.split(';')[0];
    if(data.access_token&&cookie){
      const logout=await fetch(base+'/api/auth/logout',{
        method:'POST',headers:{origin:'https://'+domain,authorization:'Bearer '+data.access_token,cookie},
        signal:AbortSignal.timeout(12000)
      });
      logoutStatus=logout.status;
    }
  }
  console.info('Bootstrap login self-check',{
    userFound:Boolean(user),rawMatch,trimmedMatch,
    httpStatus:status,revoked:logoutStatus===204
  });
}
