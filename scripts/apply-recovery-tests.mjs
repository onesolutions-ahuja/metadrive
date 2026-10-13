import { readFileSync, writeFileSync } from 'node:fs';
const f='apps/server/test/module4-password-recovery.smoke.test.ts';let s=readFileSync(f,'utf8');
const from="smtpCredentialId: credentialId, fromEmail: 'help@recovery-mail.test'\n    });\n    assert.equal(settings.status, 200";
const to="smtpCredentialId: credentialId, fromEmail: 'help@recovery-mail.test',\n      policy: { method:'LINK',defaultChannel:'email',allowedChannels:['email'] }\n    });\n    assert.equal(settings.status, 200";
if(s.split(from).length!==2)throw Error('Recovery legacy link test anchor missing');s=s.replace(from,to);
writeFileSync(f,s);console.log('Legacy link smoke test explicitly selects link policy');