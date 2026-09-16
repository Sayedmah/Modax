import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../backend/server.mjs',import.meta.url),'utf8');
test('server exposes create repair and build Game Studio routes',()=>{
 assert.match(source,/godot-api\.mjs/);
 for(const route of ['/v1/game-studio/create','/v1/game-studio/repair','/v1/game-studio/build']) assert.ok(source.includes(route),`missing ${route}`);
 assert.match(source,/MODY_GODOT_WORKER_URL/);
});