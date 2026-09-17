import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canAccessAdmin } from '../backend/auth.mjs';

const server=fs.readFileSync(new URL('../backend/server.mjs',import.meta.url),'utf8');

test('admin role helper accepts owner and admin only',()=>{
  assert.equal(canAccessAdmin('owner'),true);
  assert.equal(canAccessAdmin('admin'),true);
  assert.equal(canAccessAdmin('support'),false);
  assert.equal(canAccessAdmin('user'),false);
});

test('server exposes authenticated me endpoint',()=>{
  assert.match(server,/\/v1\/me/);
  assert.match(server,/id:user\.id,email:user\.email,role:user\.role/);
});

test('server exposes owner-admin overview endpoint',()=>{
  assert.match(server,/\/v1\/admin\/overview/);
  assert.match(server,/requireRole\(user,\['owner','admin'\]\)/);
});
