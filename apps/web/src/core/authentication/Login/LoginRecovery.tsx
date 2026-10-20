import {useEffect,useState} from 'react';
import {apiRequest} from '../Client/authClient';
export default function LoginRecovery({onClose}:{onClose:()=>void}){
 const params=new URLSearchParams(window.location.search);
 const [email,setEmail]=useState(params.get('resetEmail')??''),[token,setToken]=useState(params.get('resetToken')??'');
 const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[sent,setSent]=useState(!!token);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 // Remove emailed credentials from the address bar and subsequent navigation/referrers.
 useEffect(()=>{if(params.has('resetToken')){params.delete('resetToken');params.delete('resetEmail');window.history.replaceState(null,'',window.location.pathname+(params.size?'?'+params.toString():'')+window.location.hash);}},[]);
 return <section><h2>Recover your password</h2>
  <form onSubmit={e=>{
   e.preventDefault();setBusy(true);setMessage('');
   if(sent&&password!==confirm){setMessage('Passwords must match.');setBusy(false);return;}
   void apiRequest<{message:string}>(sent?'/auth/password-reset/confirm':'/auth/password-reset/request',{method:'POST',body:JSON.stringify(sent?{email,token,newPassword:password}:{email})})
    .then(r=>{setMessage(r.message);if(sent){setPassword('');setConfirm('');setToken('');}else setSent(true);})
    .catch(e=>setMessage(e instanceof Error?e.message:String(e))).finally(()=>setBusy(false));
  }}>
   <label className="form-label">Account email<input className="form-control" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
   {sent&&<>
    <label className="form-label">Code from your recovery email<input className="form-control" autoComplete="one-time-code" value={token} onChange={e=>setToken(e.target.value)} required/></label>
    <label className="form-label">New password<input className="form-control" type="password" autoComplete="new-password" minLength={12} value={password} onChange={e=>setPassword(e.target.value)} required/></label>
    <label className="form-label">Confirm password<input className="form-control" type="password" autoComplete="new-password" minLength={12} value={confirm} onChange={e=>setConfirm(e.target.value)} required/></label>
   </>}
   <button className="btn btn-brand" type="submit" disabled={busy}>{busy?'Please wait…':sent?'Change password':'Send recovery email'}</button>
  </form>
  <p>MFA remains required after password recovery. Use your authenticator, saved backup code or passkey when signing in.</p>
  {message&&<p role="status">{message}</p>}
  <button className="text-action" type="button" onClick={onClose}>Return to sign in</button>
 </section>;
}
