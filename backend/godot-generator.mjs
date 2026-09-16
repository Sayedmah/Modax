import { validateManifest } from './godot-worker.mjs';

function cleanJson(text){
 const s=String(text??'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 try{return JSON.parse(s);}catch{throw new Error('Godot generator returned invalid JSON');}
}

function normalizeBrief(brief){
 if(!brief||typeof brief!=='object') throw new Error('Game brief is required');
 const title=String(brief.title||'').trim();
 const dimension=String(brief.dimension||'').toUpperCase();
 const genre=String(brief.genre||'').trim();
 const idea=String(brief.idea||'').trim();
 const targets=Array.isArray(brief.targets)?brief.targets.map(String):[];
 if(title.length<2||!['2D','3D'].includes(dimension)||!genre||idea.length<10||!targets.length) throw new Error('Invalid game brief');
 return {title,dimension,genre,idea,targets};
}

export function buildGodotGenerationPrompt(brief){
 const b=normalizeBrief(brief);
 return `You are MODY Godot Engineer. Create a minimal playable ${b.dimension} Godot project for this brief: ${JSON.stringify(b)}. Return ONLY JSON: {"files":[{"path":"project.godot","content":"..."}, ...]}. The manifest MUST include project.godot and every referenced .tscn/.gd resource needed for the first playable scene. Prefer built-in Godot nodes and generated primitives so the first build does not depend on missing external assets. Use res:// references inside Godot files. Do not use absolute filesystem paths, .. traversal, shell commands, network download code, editor plugins, or native extensions. Do not claim that Godot ran, built, exported, or that the game is playable; only the worker may verify that.`;
}

export function parseGeneratedProject(text){
 const data=cleanJson(text);
 if(!data||!Array.isArray(data.files)) throw new Error('Generated project must contain files');
 return {files:validateManifest(data.files)};
}

export function buildRepairPrompt(brief,files,diagnostics){
 const b=normalizeBrief(brief);
 const safe=validateManifest(files);
 const errors=(Array.isArray(diagnostics)?diagnostics:[]).map(String).slice(0,50);
 if(!errors.length) throw new Error('Repair diagnostics are required');
 return `You are MODY Godot Debugger. Repair this Godot project. Brief: ${JSON.stringify(b)}. Worker diagnostics: ${JSON.stringify(errors)}. Current manifest: ${JSON.stringify({files:safe})}. Return ONLY JSON with a full replacement manifest in exactly this shape: {"files":[{"path":"project.godot","content":"..."}, ...]}. Fix the reported errors without removing required gameplay unless necessary. Do not use absolute paths, .. traversal, shell commands, network downloads, editor plugins, or native extensions. Do not claim the repair passed; the worker will verify it.`;
}

export function nextGodotAction(workerResult,attempt,maxAttempts=3){
 const n=Math.max(0,Number(attempt)||0);
 if(workerResult?.status==='passed'&&workerResult?.playable) return {action:'play',reason:'verified-export'};
 if(workerResult?.status==='failed'&&n<maxAttempts) return {action:'repair',attempt:n+1};
 return {action:'stop',reason:workerResult?.status==='failed'?'repair-limit':'not-playable'};
}