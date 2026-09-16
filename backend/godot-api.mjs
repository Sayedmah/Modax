import { buildGodotGenerationPrompt, parseGeneratedProject, buildRepairPrompt } from './godot-generator.mjs';
import { buildGodotJob } from './godot-worker.mjs';

function needText(value,name){const v=String(value||'').trim();if(!v)throw Object.assign(new Error(`${name} is required`),{status:400});return v;}

export async function routeGodotApi(action,body={},deps={}){
 try{
  if(action==='create'){
   if(typeof deps.ai!=='function') throw Object.assign(new Error('AI service unavailable'),{status:503});
   const provider=needText(body.provider,'provider'), model=needText(body.model,'model');
   const prompt=buildGodotGenerationPrompt(body.brief);
   const result=await deps.ai({provider,model,prompt,max_output_tokens:8192});
   const project=parseGeneratedProject(result?.text);
   return {status:201,body:{state:'generated',provider,model,files:project.files,verified:false,playable:false}};
  }
  if(action==='repair'){
   if(typeof deps.ai!=='function') throw Object.assign(new Error('AI service unavailable'),{status:503});
   const provider=needText(body.provider,'provider'), model=needText(body.model,'model');
   const prompt=buildRepairPrompt(body.brief,body.files,body.diagnostics);
   const result=await deps.ai({provider,model,prompt,max_output_tokens:8192});
   const project=parseGeneratedProject(result?.text);
   return {status:200,body:{state:'repaired',provider,model,files:project.files,verified:false,playable:false}};
  }
  if(action==='build'){
   if(typeof deps.queueBuild!=='function') throw Object.assign(new Error('Godot worker queue unavailable'),{status:503});
   const job=buildGodotJob(body.projectId,body.files,{target:body.target});
   const queued=await deps.queueBuild(job);
   if(!queued?.accepted) throw Object.assign(new Error('Godot worker rejected build'),{status:503});
   return {status:202,body:{state:'queued',jobId:queued.jobId||null,job,playable:false}};
  }
  return {status:404,body:{error:'Unknown Game Studio action'}};
 }catch(err){return {status:Number(err?.status)||400,body:{error:err?.message||'Game Studio request failed'}};}
}