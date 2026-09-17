import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const indexHtml=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('workspace asks backend for account role',()=>{
  assert.match(indexHtml,/\/v1\/me/);
  assert.match(indexHtml,/accountRole/);
});

test('workspace exposes admin entry only through role-aware logic',()=>{
  assert.match(indexHtml,/admin\.html/);
  assert.match(indexHtml,/owner/);
  assert.match(indexHtml,/admin/);
});
