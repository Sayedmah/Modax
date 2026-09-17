import test from 'node:test';
import assert from 'node:assert/strict';
import { runStableAnswer } from '../backend/stable-answer-stream.mjs';

test('emits the final answer from the old generateContent path', async () => {
  const events=[];
  const result=await runStableAnswer({
    candidates:['gemini-3.8-flash'],
    body:{prompt:'مرحبا'},
    generate:async ()=>({text:'أهلًا بك',usage:{totalTokenCount:4}}),
    emit:(type,data)=>events.push({type,data})
  });
  assert.equal(result.text,'أهلًا بك');
  assert.deepEqual(events.map(e=>e.type),['status','model','text','usage','done']);
  assert.equal(events.find(e=>e.type==='text').data.text,'أهلًا بك');
});

test('falls back to the next model when the first old generateContent call fails', async () => {
  const seen=[]; const events=[];
  const result=await runStableAnswer({
    candidates:['gemini-3.8-flash','gemini-3.7-flash'],
    body:{prompt:'اختبار'},
    generate:async model=>{seen.push(model);if(model==='gemini-3.8-flash')throw Object.assign(new Error('busy'),{status:503});return {text:'الرد النهائي'};},
    shouldFallback:err=>err.status===503,
    emit:(type,data)=>events.push({type,data})
  });
  assert.deepEqual(seen,['gemini-3.8-flash','gemini-3.7-flash']);
  assert.equal(result.model,'gemini-3.7-flash');
  assert.ok(events.some(e=>e.type==='status'&&e.data.stage==='fallback'));
});
