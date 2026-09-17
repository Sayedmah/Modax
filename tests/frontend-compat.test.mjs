import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFrontendChat } from '../backend/frontend-compat.mjs';

test('legacy frontend message becomes Gemini chat request',()=>{
  const out=normalizeFrontendChat({message:'مرحبا',model:'gemini-2.5-flash'},['google']);
  assert.equal(out.provider,'google');
  assert.equal(out.prompt,'مرحبا');
  assert.equal(out.model,'gemini-2.5-flash');
});

test('AUTO frontend request gets a usable Google default',()=>{
  const out=normalizeFrontendChat({message:'مرحبا',model:null,mode:'auto'},['google']);
  assert.equal(out.provider,'google');
  assert.equal(out.model,'gemini-2.5-flash');
});

test('explicit provider and prompt are preserved',()=>{
  const out=normalizeFrontendChat({provider:'google',prompt:'hello',model:'gemini-2.5-pro'},['google']);
  assert.equal(out.provider,'google');
  assert.equal(out.prompt,'hello');
  assert.equal(out.model,'gemini-2.5-pro');
});