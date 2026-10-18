import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readSubmittedLogin} from '../../src/core/authentication/Login/readSubmittedLogin.ts';

test('uses the actual browser-autofilled input instead of an older React state value',()=>{
  const form=new FormData();
  form.set('email','  support@example.com  ');
  form.set('password','older-password');
  form.set('password','fresh-password-from-browser');
  const submitted=readSubmittedLogin(form);
  assert.deepEqual(submitted,{email:'support@example.com',password:'fresh-password-from-browser'});
});
test('does not silently trim or change password characters',()=>{
  const form=new FormData();
  form.set('email',' user@example.com ');
  form.set('password',' A password with surrounding spaces ');
  assert.equal(readSubmittedLogin(form).password,' A password with surrounding spaces ');
});
