import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInteractionInput, parseGoogleSseBlock } from '../backend/gemini-stream.mjs';

test('buildInteractionInput preserves multi-turn conversation context',()=>{
 const input=buildInteractionInput([
  {role:'user',content:'اسمي محمود'},
  {role:'assistant',content:'أهلًا محمود'},
  {role:'user',content:'ما اسمي؟'}
 ]);
 assert.match(input,/المستخدم: اسمي محمود/);
 assert.match(input,/MODY: أهلًا محمود/);
 assert.match(input,/المستخدم: ما اسمي؟/);
});

test('parseGoogleSseBlock exposes thought summaries but never thought signatures',()=>{
 const thought=parseGoogleSseBlock('event: step.delta\ndata: {"event_type":"step.delta","delta":{"type":"thought_summary","content":{"type":"text","text":"أراجع المطلوب"}}}');
 assert.deepEqual(thought,{type:'thought',text:'أراجع المطلوب'});
 const signature=parseGoogleSseBlock('event: step.delta\ndata: {"event_type":"step.delta","delta":{"type":"thought_signature","signature":"secret"}}');
 assert.equal(signature,null);
});

test('parseGoogleSseBlock exposes answer text and completion usage',()=>{
 assert.deepEqual(parseGoogleSseBlock('data: {"event_type":"step.delta","delta":{"type":"text","text":"مرحبا"}}'),{type:'text',text:'مرحبا'});
 const done=parseGoogleSseBlock('data: {"event_type":"interaction.completed","interaction":{"usage":{"total_tokens":12}}}');
 assert.deepEqual(done,{type:'done',usage:{total_tokens:12}});
});