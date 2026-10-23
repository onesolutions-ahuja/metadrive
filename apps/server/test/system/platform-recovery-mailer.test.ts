import assert from 'node:assert/strict';
import {test} from 'node:test';
import {isPlatformRecoveryMailConfigured} from '../../src/system-support/platform-recovery-mailer.js';

const valid={
 METADRIVE_PLATFORM_SMTP_HOST:'smtp.example.com',
 METADRIVE_PLATFORM_SMTP_PORT:'587',
 METADRIVE_PLATFORM_SMTP_USERNAME:'service-account',
 METADRIVE_PLATFORM_SMTP_PASSWORD:'private-secret',
 METADRIVE_PLATFORM_SMTP_FROM_EMAIL:'security@example.com'
};

test('platform recovery requires all deployment-owned transport settings',()=>{
 assert.equal(isPlatformRecoveryMailConfigured(valid),true);
 for(const key of Object.keys(valid).filter(key=>key!=='METADRIVE_PLATFORM_SMTP_PORT')){
  assert.equal(isPlatformRecoveryMailConfigured({...valid,[key]:''}),false,key);
 }
 assert.equal(isPlatformRecoveryMailConfigured({...valid,METADRIVE_PLATFORM_SMTP_PORT:'465'}),true);
 assert.equal(isPlatformRecoveryMailConfigured({...valid,METADRIVE_PLATFORM_SMTP_PORT:'25'}),false);
});

test('platform recovery rejects malformed or restricted SMTP configuration',()=>{
 for(const host of ['localhost','smtp.internal.local','127.0.0.1','http://mail.example.com','mail.example.com/path']){
  assert.equal(isPlatformRecoveryMailConfigured({...valid,METADRIVE_PLATFORM_SMTP_HOST:host}),false,host);
 }
 for(const from of ['invalid','security@example.com\\r\\nBcc:other@example.com','']){
  assert.equal(isPlatformRecoveryMailConfigured({...valid,METADRIVE_PLATFORM_SMTP_FROM_EMAIL:from}),false,from);
 }
});
