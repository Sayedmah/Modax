import test from 'node:test';
import assert from 'node:assert/strict';
import { rankAvailableGeminiModels, shouldFallbackGeminiError } from '../backend/gemini-auto-router.mjs';

test('ranks only available text Gemini models in preferred order',()=>{
 const available=[
  {id:'gemini-3.6-flash',capabilities:['generateContent']},
  {id:'gemini-3.8-flash',capabilities:['generateContent']},
  {id:'gemini-3.5-flash-lite',capabilities:['generateContent']},
  {id:'gemini-3.1-flash-image',capabilities:['generateContent']}
 ];
 assert.deepEqual(rankAvailableGeminiModels(available),['gemini-3.8-flash','gemini-3.6-flash','gemini-3.5-flash-lite']);
});

test('falls back for capacity, rate limit, unavailable, and server errors',()=>{
 for(const status of [404,429,500,502,503,504]) assert.equal(shouldFallbackGeminiError({status,message:'temporary'}),true);
 assert.equal(shouldFallbackGeminiError({status:400,message:'bad request'}),false);
 assert.equal(shouldFallbackGeminiError({status:400,message:'model is no longer available'}),true);
 assert.equal(shouldFallbackGeminiError({status:400,message:'high demand'}),true);
});