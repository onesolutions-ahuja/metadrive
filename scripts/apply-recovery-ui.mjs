import { readFileSync, writeFileSync } from 'node:fs';
const file='apps/web/src/App.tsx';let s=readFileSync(file,'utf8');
function replace(a,b){const n=s.split(a).length-1;if(n!==1)throw Error('UI anchor mismatch '+n+': '+a.slice(0,90));s=s.replace(a,b);}
replace("  const [resetToken, setResetToken] = useState(recoveryQuery.get('resetToken') ?? '');",
"  const [resetToken, setResetToken] = useState(recoveryQuery.get('resetToken') ?? '');\n  const [resetRequested, setResetRequested] = useState(false);");
replace("      setMessage(response.message);\n    } catch (failure) { setMessage(failure instanceof Error ? failure.message : 'Unable to request reset'); }",
"      setMessage(response.message);\n      setResetRequested(true);\n    } catch (failure) { setMessage(failure instanceof Error ? failure.message : 'Unable to request reset'); }");
replace("      <h1 id=\"password-reset-heading\">{resetToken ? 'Choose a new password' : 'Reset your password'}</h1>",
"      <h1 id=\"password-reset-heading\">{resetToken || resetRequested ? 'Verify and reset password' : 'Reset your password'}</h1>");
replace("        {resetToken ? <>\n          <label className=\"form-label\" htmlFor=\"reset-password\">",
"        {resetToken || resetRequested ? <>\n          <label className=\"form-label\" htmlFor=\"reset-code\">Verification code (6 digits), or use your emailed reset link</label>\n          <input className=\"form-control\" id=\"reset-code\" type=\"text\" inputMode=\"numeric\" maxLength={64} autoComplete=\"one-time-code\" value={resetToken} onChange={(event) => setResetToken(event.target.value.replace(/[^0-9A-Za-z_-]/g, ''))} />\n          <label className=\"form-label\" htmlFor=\"reset-password\">");
replace("          <p>We'll send a single-use link if email recovery is configured for your tenant. The link expires in 15 minutes.</p>",
"          <p>We'll email a single-use verification code or a reset link according to your tenant recovery settings. It expires in 15 minutes.</p>");
replace("{submitting ? 'Sending…' : 'Send reset link'}","{submitting ? 'Sending…' : 'Send verification'}");
replace("        setMessage(''); setShowPasswordReset(false); setResetToken(''); setResetFinished(false);",
"        setMessage(''); setShowPasswordReset(false); setResetToken(''); setResetRequested(false); setResetFinished(false);");
replace("  const [fromEmail, setFromEmail] = useState('');\n  const [ready, setReady] = useState(false);",
"  const [fromEmail, setFromEmail] = useState('');\n  const [method, setMethod] = useState<'OTP' | 'LINK'>('OTP');\n  const [subject, setSubject] = useState('{!Tenant.Name} — password recovery');\n  const [body, setBody] = useState('Your verification code is {!Verification.Value}. Expires in {!Verification.ExpiryMinutes} minutes.');\n  const [ready, setReady] = useState(false);");
replace("apiRequest<{ smtpCredentialId: string; fromEmail: string; linkReady: boolean }>('/auth/password-recovery/settings')",
"apiRequest<{ smtpCredentialId: string; fromEmail: string; linkReady: boolean; policy?: { method: 'OTP'|'LINK'; templates?: {email?:{subject:string;body:string}} } }>('/auth/password-recovery/settings')");
replace("        setFromEmail(value.fromEmail); setReady(value.linkReady);",
"        setFromEmail(value.fromEmail); setReady(value.linkReady);\n        setMethod(value.policy?.method ?? 'OTP');\n        setSubject(value.policy?.templates?.email?.subject ?? '{!Tenant.Name} — password recovery');\n        setBody(value.policy?.templates?.email?.body ?? 'Your verification code is {!Verification.Value}. Expires in {!Verification.ExpiryMinutes} minutes.');");
replace("method: 'PUT', body: JSON.stringify({ smtpCredentialId, fromEmail: smtpCredentialId ? fromEmail : '' })",
"method: 'PUT', body: JSON.stringify({ smtpCredentialId, fromEmail: smtpCredentialId ? fromEmail : '',\n          policy: { method, defaultChannel:'email', allowedChannels:['email'], templates: { email: { subject, body } } } })");
replace("<p>Email reset links use the tenant's SMTP Named Credential. They never bypass MFA.</p>",
"<p>Choose OTP or reset-link delivery, with editable templates and tenant-scoped SMTP. MFA is never bypassed.</p>");
replace("        <label className=\"form-label\" htmlFor=\"recovery-sender\">Sender email",
"        <label className=\"form-label\" htmlFor=\"recovery-method\">Verification method\n          <select className=\"form-control\" id=\"recovery-method\" value={method} onChange={(event)=>setMethod(event.target.value as 'OTP'|'LINK')}>\n            <option value=\"OTP\">6-digit email OTP</option><option value=\"LINK\">Email reset link</option>\n          </select>\n        </label>\n        <label className=\"form-label\" htmlFor=\"recovery-subject\">Email subject template\n          <input className=\"form-control\" id=\"recovery-subject\" value={subject} onChange={(event)=>setSubject(event.target.value)} />\n        </label>\n        <label className=\"form-label\" htmlFor=\"recovery-body\">Email body template\n          <textarea className=\"form-control\" id=\"recovery-body\" rows={5} value={body} onChange={(event)=>setBody(event.target.value)} />\n        </label>\n        <label className=\"form-label\" htmlFor=\"recovery-sender\">Sender email");
replace("        <SettingsViewRow label=\"Sender email\" value={smtpCredentialId ? fromEmail : 'Not configured'}",
"        <SettingsViewRow label=\"Verification method\" value={method} canEdit={canManage} onEdit={beginEdit} />\n        <SettingsViewRow label=\"Email template\" value={subject} canEdit={canManage} onEdit={beginEdit} />\n        <SettingsViewRow label=\"Sender email\" value={smtpCredentialId ? fromEmail : 'Platform fallback (if configured)'}");
writeFileSync(file,s);console.log('Applied recovery UI patches');