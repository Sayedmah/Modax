import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureFinalAnswer } from '../backend/final-answer-fallback.mjs';

test('keeps streamed answer and does not call fallback generator',async()=>{
 let calls=0;
 const result=await ensureFinalAnswer({streamText:'رد مباشر',model:'gemini-x',body:{prompt:'x'},generate:async()=>{calls++;return{text:'بديل'}}});
 assert.equal(calls,0);
 assert.equal(result.text,'رد مباشر');
 assert.equal(result.fallback,false);
});

test('generates and emits a fallback final answer when stream has no text',async()=>{
 const events=[];
 const result=await ensureFinalAnswer({streamText:'',model:'gemini-x',body:{prompt:'x'},generate:async(model,body)=>({text:`إجابة ${model}: ${body.prompt}`,usage:{total_tokens:7}}),emitStatus:data=>events.push(['status',data]),emitText:data=>events.push(['text',data])});
 assert.equal(result.text,'إجابة gemini-x: x');
 assert.equal(result.fallback,true);
 assert.equal(result.usage.total_tokens,7);
 assert.equal(events[0][0],'status');
 assert.equal(events[0][1].stage,'final_fallback');
 assert.deepEqual(events[1],['text',{text:'إجابة gemini-x: x',fallback:true}]);
});

test('fails loudly when both streaming and fallback generation return no text',async()=>{
 await assert.rejects(()=>ensureFinalAnswer({streamText:'',model:'gemini-x',body:{},generate:async()=>({text:''})}),err=>err?.status===502&&/final answer/i.test(err.message));
});
