import test from 'node:test';
import assert from 'node:assert/strict';
import { createJobStore } from '../backend/studio-jobs.mjs';
import { routeStudyApi } from '../backend/study-studio.mjs';
import { routeVideoApi } from '../backend/video-studio.mjs';

test('studio jobs have safe public state transitions',()=>{const s=createJobStore(()=> 'j1');const j=s.create('video-render',{projectId:'p1'});assert.equal(j.state,'queued');s.transition('j1','running');s.transition('j1','passed',{artifactUrl:'https://cdn.example/v.mp4'});assert.equal(s.get('j1').state,'passed');assert.throws(()=>s.transition('j1','running'));});

test('study explain uses curriculum context and AI',async()=>{const ai=async ({prompt})=>({text:prompt.includes('Fractions')?'Explanation':'bad'});const r=await routeStudyApi('explain',{provider:'openai',model:'m',context:{country:'Egypt',grade:'5',subject:'Math',unit:'Fractions',lesson:'Adding fractions'},question:'Explain this simply'}, {ai});assert.equal(r.status,200);assert.equal(r.body.text,'Explanation');});

test('study quiz rejects missing curriculum context',async()=>{const r=await routeStudyApi('quiz',{provider:'x',model:'m',context:{}},{ai:async()=>({text:'x'})});assert.equal(r.status,400);});

test('video storyboard uses AI but render is queued to isolated worker',async()=>{const ai=async()=>({text:JSON.stringify({title:'Demo',scenes:[{id:'s1',duration:5,narration:'Hello',visual:'Sky'}]})});const a=await routeVideoApi('storyboard',{provider:'openai',model:'m',title:'Demo',idea:'A short educational video about the sky.'},{ai});assert.equal(a.status,200);assert.equal(a.body.storyboard.scenes.length,1);const b=await routeVideoApi('render',{projectId:'p1',storyboard:a.body.storyboard},{queueRender:async job=>({accepted:true,jobId:'v1'})});assert.equal(b.status,202);assert.equal(b.body.playable,false);});