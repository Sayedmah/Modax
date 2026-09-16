import test from 'node:test';
import assert from 'node:assert/strict';
import { routeGodotApi } from '../backend/godot-api.mjs';

const brief={title:'MODY Quest',dimension:'2D',genre:'Adventure',targets:['web'],idea:'Explore ruins, collect crystals, and escape before time runs out.'};
const generated=JSON.stringify({files:[{path:'project.godot',content:'[application]'}]});

test('create calls AI and returns a validated project manifest',async()=>{
 const calls=[]; const deps={ai:async x=>{calls.push(x);return {text:generated};}};
 const r=await routeGodotApi('create',{provider:'openai',model:'model-x',brief},deps);
 assert.equal(r.status,201); assert.equal(r.body.state,'generated'); assert.equal(r.body.files[0].path,'project.godot'); assert.equal(calls.length,1);
});

test('repair requires diagnostics and returns replacement manifest',async()=>{
 const deps={ai:async()=>({text:generated})};
 const r=await routeGodotApi('repair',{provider:'openai',model:'model-x',brief,files:[{path:'project.godot',content:'bad'}],diagnostics:['Parse Error']},deps);
 assert.equal(r.status,200); assert.equal(r.body.state,'repaired');
});

test('build returns queued job and never executes shell in public API',async()=>{
 const deps={queueBuild:async job=>({jobId:'job-1',accepted:true,job})};
 const r=await routeGodotApi('build',{projectId:'p1',target:'web',files:[{path:'project.godot',content:'[application]'}]},deps);
 assert.equal(r.status,202); assert.equal(r.body.state,'queued'); assert.ok(!('command' in r.body.job));
});

test('unknown action is 404',async()=>{const r=await routeGodotApi('wat',{},{});assert.equal(r.status,404);});