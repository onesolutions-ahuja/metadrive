import { useEffect, useState, type FormEvent } from 'react';
import type { ObjectMetadata, LightningPageMetadata, LightningAppMetadata } from './metadata';
import { apiRequest, setAccessToken } from './authClient';
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



export function createLoginView(logoUrl: string) {
function Login({ error, onStart, onSuccess, onRetry }: { error?: string; onStart?: () => void; onSuccess?: (timing: EntryTiming) => void; onRetry?: () => void }) {
  const recoveryQuery = new URLSearchParams(window.location.search);
  const [email, setEmail] = useState(recoveryQuery.get('resetEmail') ?? '');
  const [password, setPassword] = useState('');
  const [resetToken, setResetToken] = useState(recoveryQuery.get('resetToken') ?? '');
  const [resetRequested, setResetRequested] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [resetFinished, setResetFinished] = useState(false);
  useEffect(() => {
    if (!resetToken) return;
    const clean = new URL(window.location.href);
    clean.searchParams.delete('resetEmail');
    clean.searchParams.delete('resetToken');
    window.history.replaceState(window.history.state, '', clean.pathname + clean.search + clean.hash);
  }, []);

  const [mfaChallenge, setMfaChallenge] = useState<{ challenge_token: string; enrollment_required: boolean; setup_secret?: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [showPasswordReset, setShowPasswordReset] = useState(Boolean(resetToken));
  const [message, setMessage] = useState(error ?? '');
  const [submitting, setSubmitting] = useState(false);
  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onStart?.();
    const startedAt = performance.now();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    setSubmitting(true);
    setMessage('');
    try {
      const session = await apiRequest<{ access_token?: string; landing?: LandingBootstrap; mfa_required?: boolean; challenge_token?: string; enrollment_required?: boolean; setup_secret?: string }>('/auth/login?landing=1', {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({ email, password })
      });
      if (session.mfa_required && session.challenge_token) {
        setMfaChallenge({ challenge_token: session.challenge_token, enrollment_required: Boolean(session.enrollment_required), setup_secret: session.setup_secret });
        setPassword('');
        return;
      }
      if (!session.access_token) throw new Error('Authentication did not return an access token');
      setAccessToken(session.access_token);
      onSuccess?.({ kind: 'login', startedAt, authenticatedAt: performance.now(), landing: session.landing });
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
  const verifyMfa = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!mfaChallenge) return;
    setSubmitting(true);
    setMessage('');
    const startedAt = performance.now();
    try {
      const session = await apiRequest<{ access_token: string; landing?: LandingBootstrap }>('/auth/mfa/verify?landing=1', {
        method: 'POST',
        body: JSON.stringify({ challenge_token: mfaChallenge.challenge_token, code: mfaCode })
      });
      setAccessToken(session.access_token);
      onSuccess?.({ kind: 'login', startedAt, authenticatedAt: performance.now(), landing: session.landing });
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : 'MFA verification failed');
    } finally { setSubmitting(false); }
  };
  if (mfaChallenge) return <main className="auth-screen">
    <form className="auth-card" onSubmit={(event) => void verifyMfa(event)}>
      <img className="auth-brand-logo" src={logoUrl} alt="UNE Solutions" />
      <div className="eyebrow">ACCOUNT SECURITY</div>
      <h1>{mfaChallenge.enrollment_required ? 'Set up your authenticator' : 'Verify your identity'}</h1>
      {mfaChallenge.enrollment_required && <>
        <p>In your authenticator app, add an account manually using this setup key. Then enter its six-digit code to finish enrollment.</p>
        <div className="auth-notice"><strong>Setup key</strong><p><code style={{ overflowWrap: 'anywhere' }}>{mfaChallenge.setup_secret}</code></p></div>
      </>}
      {!mfaChallenge.enrollment_required && <p>Enter the current six-digit code from your authenticator app.</p>}
      {message && <div className="auth-error" role="alert">{message}</div>}
      <label className="form-label" htmlFor="login-mfa-code">Authenticator code</label>
      <input className="form-control" id="login-mfa-code" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
        autoComplete="one-time-code" required value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/[^0-9]/g, ''))} />
      <button className="btn btn-brand auth-submit" disabled={submitting}>{submitting ? 'Verifying…' : 'Verify and sign in'}</button>
      <button className="text-action auth-back" type="button" onClick={() => {
        setMfaChallenge(null); setMfaCode(''); setMessage('');
      }}>Back to sign in</button>
    </form>
  </main>;
  const requestReset = async () => {
    setSubmitting(true); setMessage('');
    try {
      const response = await apiRequest<{ message: string }>('/auth/password-reset/request', {
        method: 'POST', body: JSON.stringify({ email })
      });
      setMessage(response.message);
      setResetRequested(true);
    } catch (failure) { setMessage(failure instanceof Error ? failure.message : 'Unable to request reset'); }
    finally { setSubmitting(false); }
  };
  const confirmReset = async () => {
    if (newPassword !== repeatPassword) { setMessage('Passwords do not match.'); return; }
    setSubmitting(true); setMessage('');
    try {
      await apiRequest('/auth/password-reset/confirm', {
        method: 'POST', body: JSON.stringify({ email, token: resetToken, newPassword })
      });
      setResetFinished(true); setResetToken(''); setNewPassword(''); setRepeatPassword('');
      setMessage('Password changed. Sign in with your new password. Your MFA requirements remain unchanged.');
    } catch (failure) { setMessage(failure instanceof Error ? failure.message : 'Unable to reset password'); }
    finally { setSubmitting(false); }
  };
  if (showPasswordReset) return <main className="auth-screen">
    <section className="auth-card" aria-labelledby="password-reset-heading">
      <img className="auth-brand-logo" src={logoUrl} alt="UNE Solutions" />
      <div className="eyebrow">ACCOUNT RECOVERY</div>
      <h1 id="password-reset-heading">{resetToken || resetRequested ? 'Verify and reset password' : 'Reset your password'}</h1>
      {message && <div className="auth-notice" role="status">{message}</div>}
      {!resetFinished && <>
        <label className="form-label" htmlFor="reset-email">Account email</label>
        <input className="form-control" id="reset-email" type="email" value={email}
          onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
        {resetToken || resetRequested ? <>
          <label className="form-label" htmlFor="reset-code">Verification code (6 digits), or use your emailed reset link</label>
          <input className="form-control" id="reset-code" type="text" inputMode="numeric" maxLength={64} autoComplete="one-time-code" value={resetToken} onChange={(event) => setResetToken(event.target.value.replace(/[^0-9A-Za-z_-]/g, ''))} />
          <label className="form-label" htmlFor="reset-password">New password (minimum 12 characters)</label>
          <input className="form-control" id="reset-password" type="password" minLength={12}
            autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          <label className="form-label" htmlFor="reset-confirm">Confirm password</label>
          <input className="form-control" id="reset-confirm" type="password" minLength={12}
            autoComplete="new-password" value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} />
          <button className="btn btn-brand auth-submit" type="button"
            disabled={submitting || !email || newPassword.length < 12 || !repeatPassword}
            onClick={() => void confirmReset()}>{submitting ? 'Saving…' : 'Reset password'}</button>
        </> : <>
          <p>We'll email a single-use verification code or a reset link according to your tenant recovery settings. It expires in 15 minutes.</p>
          <button className="btn btn-brand auth-submit" type="button" disabled={submitting || !email}
            onClick={() => void requestReset()}>{submitting ? 'Sending…' : 'Send verification'}</button>
        </>}
      </>}
      <button className="text-action auth-back" type="button" onClick={() => {
        setMessage(''); setShowPasswordReset(false); setResetToken(''); setResetRequested(false); setResetFinished(false);
      }}>Back to sign in</button>
    </section>
  </main>;
  return <main className="auth-screen">
    <form className="auth-card" onSubmit={(event) => void signIn(event)}>
      <img className="auth-brand-logo" src={logoUrl} alt="UNE Solutions" />
      <div className="eyebrow">UNEENGINE WORKSPACE</div>
      <h1>Welcome back</h1>
      <p>Sign in to manage your organization’s metadata and workflows.</p>
      {message && <div className="auth-error" role="alert">{message}{onRetry && <button type="button" className="text-action" onClick={onRetry}>Retry connection</button>}</div>}
      <label className="form-label" htmlFor="login-email">Email</label>
      <input className="form-control" id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
      <label className="form-label" htmlFor="login-password">Password</label>
      <input className="form-control" id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
      <button className="text-action auth-forgot" type="button" onClick={() => { setMessage(''); setShowPasswordReset(true); }}>Forgot password?</button>
      <button className="btn btn-brand auth-submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
    </form>
  </main>;
}


return Login;
}
