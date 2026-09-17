import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('admin page is branded and loads protected admin client',()=>{
  const html=read('admin.html');
  assert.match(html,/Modax AI/);
  assert.match(html,/لوحة الإدارة/);
  assert.match(html,/admin\.js/);
  assert.match(html,/auth\.js/);
});

test('admin client verifies server role and redirects normal users',()=>{
  const js=read('admin.js');
  assert.match(js,/\/v1\/me/);
  assert.match(js,/\/v1\/admin\/overview/);
  assert.match(js,/Bearer/);
  assert.match(js,/owner/);
  assert.match(js,/admin/);
  assert.match(js,/index\.html/);
});

test('admin UI exposes the initial control-plane sections',()=>{
  const html=read('admin.html');
  for(const label of ['المستخدمون','النماذج','الباقات','الاستخدام','سجل الإدارة']) assert.match(html,new RegExp(label));
});
