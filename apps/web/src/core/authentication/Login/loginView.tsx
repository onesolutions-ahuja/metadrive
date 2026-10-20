import { useEffect,useState, type FormEvent } from 'react';
import { readSubmittedLogin } from './readSubmittedLogin';
import type { ObjectMetadata, LightningPageMetadata, LightningAppMetadata } from '../../metadata/Definitions/metadata';
import { apiRequest, setAccessToken } from '../Client/authClient';
import LoginRecovery from './LoginRecovery';

type LandingBootstrap = {
  objects: ObjectMetadata[];
  pages: LightningPageMetadata[];
  apps: LightningAppMetadata[];
  user: {
    profileId: string;
    permissions: string[];
    fieldAccess: Record<string, { read: boolean; edit: boolean }>;
    recordTypeAccess: Record<string, boolean>;
  };
};
type EntryTiming = { kind: 'login' | 'restore'; startedAt: number; authenticatedAt: number; landing?: LandingBootstrap };
type LoginResult={access_token?:string;landing?:LandingBootstrap;mfa_required?:boolean;challenge_token?:string;setup_secret?:string;enrollment_required?:boolean};
let federationCompletion:Promise<LoginResult|undefined>|undefined;

export function createLoginView(logoUrl: string) {
  function Login({ error, onStart, onSuccess, onRetry }: {
    error?: string;
    onStart?: () => void;
    onSuccess?: (timing: EntryTiming) => void;
    onRetry?: () => void;
  }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [message, setMessage] = useState(error ?? '');
    const [submitting, setSubmitting] = useState(false);
    const [challenge,setChallenge]=useState<{challenge_token:string;setup_secret?:string;enrollment_required?:boolean}|null>(null);
    const [code,setCode]=useState('');
    const [providers,setProviders]=useState<Array<{id:string;label:string}>>([]);
    const [recovering,setRecovering]=useState(()=>new URLSearchParams(window.location.search).has('resetToken'));
    const accept=(session:{access_token?:string;landing?:LandingBootstrap;mfa_required?:boolean;challenge_token?:string;setup_secret?:string;enrollment_required?:boolean},startedAt:number)=>{
      if(session.mfa_required&&session.challenge_token){setPassword('');setChallenge({...session,challenge_token:session.challenge_token});return;}
      if(!session.access_token)throw Error('Authentication did not return an access token');
      setAccessToken(session.access_token);onSuccess?.({kind:'login',startedAt,authenticatedAt:performance.now(),landing:session.landing});
    };
    useEffect(()=>{
      let active=true;
      void apiRequest<{providers:Array<{id:string;label:string}>}>('/auth/federation/providers').then(r=>{if(active)setProviders(r.providers);}).catch(()=>{});
      const startedAt=performance.now();
      federationCompletion??=apiRequest<LoginResult|undefined>('/auth/federation/complete',{method:'POST'}).finally(()=>{federationCompletion=undefined;});
      void federationCompletion.then(r=>{if(active&&r)accept(r,startedAt);}).catch(e=>{if(active)setMessage(e instanceof Error?e.message:String(e));});
      return()=>{active=false;};
    },[]);
    const passkey=async()=>{
      if(!challenge)return;setSubmitting(true);setMessage('');
      try{
        const {startAuthentication}=await import('@simplewebauthn/browser');
        const request=await apiRequest<{options:Parameters<typeof startAuthentication>[0]['optionsJSON'];token:string}>('/auth/passkeys/options',{method:'POST',body:JSON.stringify({challenge_token:challenge.challenge_token})});
        const response=await startAuthentication({optionsJSON:request.options});
        accept(await apiRequest('/auth/passkeys/verify',{method:'POST',body:JSON.stringify({token:request.token,response})}),performance.now());
      }catch(e){setMessage(e instanceof Error?e.message:String(e));}finally{setSubmitting(false);}
    };

    const signIn = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const { email: submittedEmail, password: submittedPassword } = challenge?{email:'',password:''}:readSubmittedLogin(new FormData(event.currentTarget));
      onStart?.();
      const startedAt = performance.now();
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10000);
      setSubmitting(true);
      setMessage('');
      try {
        const session = await apiRequest<{
          access_token?: string;
          landing?: LandingBootstrap;
          mfa_required?: boolean;
          challenge_token?:string;setup_secret?:string;enrollment_required?:boolean;
        }>(challenge?'/auth/mfa/verify':'/auth/login?landing=1', {
          method: 'POST',
          signal: controller.signal,
          body: JSON.stringify(challenge?{challenge_token:challenge.challenge_token,code}:{ email: submittedEmail, password: submittedPassword })
        });
        accept(session,startedAt);
      } catch (failure) {
        setMessage(failure instanceof DOMException && failure.name === 'AbortError'
          ? 'Login timed out. The workspace API is unavailable. Please retry.'
          : failure instanceof TypeError
            ? 'Cannot connect to the workspace API. Please retry when the service is online.'
            : failure instanceof Error ? failure.message : 'Unable to sign in');
      } finally {
        window.clearTimeout(timeout);
        setSubmitting(false);
      }
    };

    if(recovering)return <main className="auth-screen"><div className="auth-card"><LoginRecovery onClose={()=>setRecovering(false)}/></div></main>;
    return <main className="auth-screen">
      <form className="auth-card" onSubmit={(event) => void signIn(event)}>
        <img className="auth-brand-logo" src={logoUrl} alt="UNE Solutions" />
        <div className="eyebrow">UNEENGINE WORKSPACE</div>
        <h1>Welcome back</h1>
        <p>Sign in to manage your organization&apos;s metadata and workflows.</p>
        {message && <div className="auth-error" role="alert">
          {message}{onRetry && <button type="button" className="text-action" onClick={onRetry}>Retry connection</button>}
        </div>}
        {challenge?<>
          <h2>{challenge.enrollment_required?'Set up your authenticator':'Verify your login'}</h2>
          {challenge.setup_secret&&<p>Add this key to your authenticator app: <code>{challenge.setup_secret}</code></p>}
          <label className="form-label" htmlFor="login-mfa">Authenticator or backup code</label>
          <input className="form-control" id="login-mfa" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value)} required maxLength={23}/>
          {!challenge.enrollment_required&&<button type="button" className="btn" disabled={submitting} onClick={()=>void passkey()}>Use a passkey</button>}
          <button type="button" className="text-action" onClick={()=>{setChallenge(null);setCode('');setMessage('');}}>Start again</button>
        </>:<>
        <label className="form-label" htmlFor="login-email">Email</label>
        <input className="form-control" id="login-email" name="email" type="email" value={email}
          onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
        <label className="form-label" htmlFor="login-password">Password</label>
        <input className="form-control" id="login-password" name="password"
          type={passwordVisible ? 'text' : 'password'} value={password}
          onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        <button className="text-action" type="button" aria-controls="login-password" onClick={(event) => {
          const field = event.currentTarget.form?.elements.namedItem('password');
          if (field instanceof HTMLInputElement) setPassword(field.value);
          setPasswordVisible((value) => !value);
        }}>{passwordVisible ? 'Hide password' : 'Show password'}</button>
        <button className="text-action" type="button" onClick={()=>setRecovering(true)}>Forgot password?</button>
        {providers.map(provider=><button key={provider.id} type="button" className="btn" disabled={submitting} onClick={()=>{
          setSubmitting(true);void apiRequest<{url:string}>('/auth/federation/start',{method:'POST',body:JSON.stringify({providerId:provider.id})})
            .then(r=>{
              if(window.location.pathname==='/oauth/authorize')sessionStorage.setItem('md_oauth_return',JSON.stringify({query:window.location.search,expires:Date.now()+600000}));
              window.location.assign(r.url);
            }).catch(e=>{setMessage(e instanceof Error?e.message:String(e));setSubmitting(false);});
        }}>Continue with {provider.label}</button>)}
        </>}
        <button className="btn btn-brand auth-submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>;
  }

  return Login;
}
