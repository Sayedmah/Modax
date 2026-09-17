import test from 'node:test';
import assert from 'node:assert/strict';
import { getBearerToken, requireRole, canAccessAdmin } from '../backend/auth.mjs';

test('extracts bearer token',()=>{
  assert.equal(getBearerToken({authorization:'Bearer abc123'}),'abc123');
});

test('rejects missing bearer token',()=>{
  assert.throws(()=>getBearerToken({}),/Authentication required/);
});

test('owner satisfies owner-only check',()=>{
  assert.doesNotThrow(()=>requireRole({role:'owner'},['owner']));
});

test('normal user cannot enter admin route',()=>{
  assert.throws(()=>requireRole({role:'user'},['owner','admin']),/Forbidden/);
});

test('admin access accepts owner and admin only',()=>{
  assert.equal(canAccessAdmin('owner'),true);
  assert.equal(canAccessAdmin('admin'),true);
  assert.equal(canAccessAdmin('support'),false);
  assert.equal(canAccessAdmin('user'),false);
});
