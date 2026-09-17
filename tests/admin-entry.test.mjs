import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const authJs=fs.readFileSync(new URL('../auth.js',import.meta.url),'utf8');

test('workspace account bootstrap asks backend for account role',()=>{
  assert.match(authJs,/\/v1\/me/);
  assert.match(authJs,/accountRole/);
});

test('workspace exposes admin entry only through role-aware logic',()=>{
  assert.match(authJs,/admin\.html/);
  assert.match(authJs,/owner/);
  assert.match(authJs,/admin/);
});
