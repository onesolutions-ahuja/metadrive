import {readFileSync,writeFileSync} from 'node:fs';
const f='apps/server/src/index.ts';let s=readFileSync(f,'utf8');
function patch(a,b){const c=s.split(a).length-1;if(c!==1)throw Error('Persistence patch mismatch '+c+': '+a.slice(0,85));s=s.replace(a,b)}
patch("passwordRecovery: z.object({ smtpCredentialId: z.string().default(''), fromEmail: z.string().default('') })",
"passwordRecovery: z.object({ smtpCredentialId: z.string().default(''), fromEmail: z.string().default(''), policy: z.unknown().optional() })");
patch("tokenHash: z.string().regex(/^[0-9a-f]{64}$/),\n      expiresAt:",
"tokenHash: z.string().regex(/^(?:[0-9a-f]{64}|[0-9a-f]{32}:[0-9a-f]{64})$/),\n      expiresAt:");
writeFileSync(f,s);console.log('Persistence schemas preserve tenant recovery policy and salted OTP verifier.');
