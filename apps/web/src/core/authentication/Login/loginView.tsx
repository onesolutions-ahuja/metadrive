import { useState, type FormEvent } from 'react';
import { readSubmittedLogin } from './readSubmittedLogin';
import type { ObjectMetadata, LightningPageMetadata, LightningAppMetadata } from '../../metadata/Definitions/metadata';
import { apiRequest, setAccessToken } from '../Client/authClient';

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

    const signIn = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const { email: submittedEmail, password: submittedPassword } = readSubmittedLogin(new FormData(event.currentTarget));
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
        }>('/auth/login?landing=1', {
          method: 'POST',
          signal: controller.signal,
          body: JSON.stringify({ email: submittedEmail, password: submittedPassword })
        });
        if (session.mfa_required) {
          throw new Error('Multi-factor login is not available yet. Contact your administrator.');
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

    return <main className="auth-screen">
      <form className="auth-card" onSubmit={(event) => void signIn(event)}>
        <img className="auth-brand-logo" src={logoUrl} alt="UNE Solutions" />
        <div className="eyebrow">UNEENGINE WORKSPACE</div>
        <h1>Welcome back</h1>
        <p>Sign in to manage your organization&apos;s metadata and workflows.</p>
        {message && <div className="auth-error" role="alert">
          {message}{onRetry && <button type="button" className="text-action" onClick={onRetry}>Retry connection</button>}
        </div>}
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
        <button className="btn btn-brand auth-submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>;
  }

  return Login;
}
