import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInteractionInput, parseGoogleSseBlock, parseGoogleSseBlocks, drainGoogleSseBuffer } from '../backend/gemini-stream.mjs';

test('buildInteractionInput preserves multi-turn conversation context',()=>{
 const input=buildInteractionInput([{role:'user',content:'اسمي محمود'},{role:'assistant',content:'أهلًا محمود'},{role:'user',content:'ما اسمي؟'}]);
 assert.match(input,/المستخدم: اسمي محمود/);assert.match(input,/MODY: أهلًا محمود/);assert.match(input,/المستخدم: ما اسمي؟/);
});

test('exposes thought summaries but never thought signatures',()=>{
 assert.deepEqual(parseGoogleSseBlock('event: step.delta\ndata: {"event_type":"step.delta","delta":{"type":"thought_summary","content":{"type":"text","text":"أراجع المطلوب"}}}'),{type:'thought',text:'أراجع المطلوب'});
 assert.equal(parseGoogleSseBlock('event: step.delta\ndata: {"event_type":"step.delta","delta":{"type":"thought_signature","signature":"secret"}}'),null);
});

test('captures model output that arrives in step.start before text deltas',()=>{
 const event=parseGoogleSseBlock('event: step.start\ndata: {"event_type":"step.start","index":1,"step":{"type":"model_output","content":[{"type":"text","text":"هذه بداية الإجابة"}]}}');
 assert.deepEqual(event,{type:'text',text:'هذه بداية الإجابة'});
});

test('captures thought summary that arrives in step.start',()=>{
 const event=parseGoogleSseBlock('event: step.start\ndata: {"event_type":"step.start","step":{"type":"thought","summary":[{"type":"text","text":"أخطط للإجابة"}]}}');
 assert.deepEqual(event,{type:'thought',text:'أخطط للإجابة'});
});

test('captures google search queries and url citations',()=>{
 const search=parseGoogleSseBlock('event: step.start\ndata: {"event_type":"step.start","step":{"type":"google_search_call","arguments":{"queries":["Gemini API docs"]}}}');
 assert.deepEqual(search,{type:'search',queries:['Gemini API docs']});
 const source=parseGoogleSseBlock('event: step.delta\ndata: {"event_type":"step.delta","delta":{"type":"text","text":"Answer","annotations":[{"type":"url_citation","url":"https://example.com/a","title":"Example"}]}}');
 assert.equal(source.type,'text');assert.equal(source.text,'Answer');assert.deepEqual(source.sources,[{url:'https://example.com/a',title:'Example'}]);
});

test('exposes completion usage',()=>{
 const done=parseGoogleSseBlock('data: {"event_type":"interaction.completed","interaction":{"usage":{"total_tokens":12}}}');
 assert.deepEqual(done,{type:'done',usage:{total_tokens:12}});
});

test('parses consecutive SSE events even when provider omits blank separators',()=>{
 const raw='event: step.start\ndata: {"event_type":"step.start","index":1,"step":{"type":"model_output"}}\nevent: step.delta\ndata: {"event_type":"step.delta","index":1,"delta":{"type":"text","text":"الإجابة النهائية"}}\nevent: step.stop\ndata: {"event_type":"step.stop","index":1}';
 assert.deepEqual(parseGoogleSseBlocks(raw),[{type:'text',text:'الإجابة النهائية'}]);
});

test('parses normal blank-line separated SSE events without losing final text',()=>{
 const raw='event: step.start\ndata: {"event_type":"step.start","index":1,"step":{"type":"model_output"}}\n\nevent: step.delta\ndata: {"event_type":"step.delta","index":1,"delta":{"type":"text","text":"Hello"}}\n\nevent: interaction.completed\ndata: {"event_type":"interaction.completed","interaction":{"usage":{"total_tokens":4}}}\n\n';
 assert.deepEqual(parseGoogleSseBlocks(raw),[{type:'text',text:'Hello'},{type:'done',usage:{total_tokens:4}}]);
});

test('drains complete provider events across chunks and flushes final unterminated event',()=>{
 let buffer='event: step.delta\ndata: {"event_type":"step.delta","delta":{"type":"text","text":"Hello"}}\n';
 let result=drainGoogleSseBuffer(buffer,false);
 assert.deepEqual(result.events,[]);
 assert.equal(result.buffer,buffer);
 buffer+='event: step.delta\ndata: {"event_type":"step.delta","delta":{"type":"text","text":" world"}}';
 result=drainGoogleSseBuffer(buffer,true);
 assert.deepEqual(result.events,[{type:'text',text:'Hello'},{type:'text',text:' world'}]);
 assert.equal(result.buffer,'');
});