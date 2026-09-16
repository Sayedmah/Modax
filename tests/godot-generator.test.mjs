import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGodotGenerationPrompt, parseGeneratedProject, buildRepairPrompt } from '../backend/godot-generator.mjs';

const brief={title:'MODY Quest',dimension:'2D',genre:'Adventure',targets:['web'],idea:'Explore ruins, collect crystals, and escape before time runs out.'};

test('generation prompt requires a complete Godot manifest and no fake build claims',()=>{
 const p=buildGodotGenerationPrompt(brief);
 assert.match(p,/project\.godot/); assert.match(p,/files/); assert.match(p,/Do not claim/i);
});

test('generated project parser accepts safe Godot files',()=>{
 const raw=JSON.stringify({files:[{path:'project.godot',content:'[application]\nrun/main_scene="res://scenes/main.tscn"'},{path:'scenes/main.tscn',content:'[gd_scene format=3]'}]});
 const out=parseGeneratedProject(raw); assert.equal(out.files.length,2);
});

test('generated project parser rejects traversal',()=>{
 const raw=JSON.stringify({files:[{path:'project.godot',content:'x'},{path:'../hack.gd',content:'x'}]});
 assert.throws(()=>parseGeneratedProject(raw));
});

test('repair prompt contains diagnostics and asks for full replacement manifest',()=>{
 const p=buildRepairPrompt(brief,[{path:'project.godot',content:'x'}],['Parse Error: player.gd:7']);
 assert.match(p,/Parse Error/); assert.match(p,/full replacement/i);
});