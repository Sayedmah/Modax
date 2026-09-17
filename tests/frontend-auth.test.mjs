import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('login screen exposes Modax identity and supported sign-in methods',()=>{
  const loginHtml=read('login.html');
  assert.match(loginHtml,/Modax AI/);
  assert.match(loginHtml,/All AI\. One Place\./);
  assert.match(loginHtml,/كل الذكاء الاصطناعي في مكان واحد/);
  assert.match(loginHtml,/Google/);
  assert.match(loginHtml,/Apple/);
  assert.match(loginHtml,/البريد الإلكتروني/);
});

test('browser auth config contains no server secret',()=>{
  const authJs=read('auth.js');
  assert.doesNotMatch(authJs,/service_role|sb_secret_/i);
  assert.match(authJs,/sb_publishable_/);
});

test('workspace is branded as Modax AI',()=>{
  const indexHtml=read('index.html');
  assert.match(indexHtml,/Modax AI/);
  assert.match(indexHtml,/All AI\. One Place\./);
  assert.match(indexHtml,/modaxAuth/);
});
