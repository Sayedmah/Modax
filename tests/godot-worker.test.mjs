import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProjectPath, validateManifest, validateWorkerResult, buildGodotJob } from '../backend/godot-worker.mjs';

test('accepts normal Godot project paths', () => {
  for (const p of ['project.godot','scenes/main.tscn','scripts/player.gd','assets/icon.svg']) assert.equal(validateProjectPath(p), p);
});

test('rejects traversal absolute Windows and null paths', () => {
  for (const p of ['/etc/passwd','../secret','scenes/../../secret','C:\\secret','']) assert.throws(() => validateProjectPath(p));
});

test('manifest rejects duplicate paths and dangerous file count', () => {
  assert.throws(() => validateManifest([{path:'a.gd',content:'x'},{path:'a.gd',content:'y'}]));
  assert.throws(() => validateManifest(Array.from({length:251},(_,i)=>({path:`f${i}.gd`,content:''}))));
});

test('worker result only enables play for verified https artifact', () => {
  assert.equal(validateWorkerResult({status:'failed',diagnostics:['parse error']}).playable,false);
  assert.throws(() => validateWorkerResult({status:'passed',previewUrl:'http://bad.example/game'}));
  const ok=validateWorkerResult({status:'passed',previewUrl:'https://games.example/build/1/',artifactVersion:'1'});
  assert.equal(ok.playable,true);
});

test('build job is data only and contains no shell command', () => {
  const job=buildGodotJob('project-1',[{path:'project.godot',content:'[application]'}],{target:'web'});
  assert.equal(job.engine,'godot'); assert.equal(job.target,'web'); assert.ok(!('command' in job)); assert.ok(!('shell' in job));
});