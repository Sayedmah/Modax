const transitions={queued:new Set(['running','failed']),running:new Set(['passed','failed']),passed:new Set(),failed:new Set()};
export function createJobStore(idFactory=()=>crypto.randomUUID()){
 const jobs=new Map();
 return {create(type,meta={}){const id=idFactory();const j={id,type:String(type),state:'queued',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),meta:{...meta}};jobs.set(id,j);return structuredClone(j);},get(id){const j=jobs.get(id);return j?structuredClone(j):null;},transition(id,state,patch={}){const j=jobs.get(id);if(!j)throw new Error('Unknown job');if(!transitions[j.state]?.has(state))throw new Error(`Invalid job transition ${j.state} -> ${state}`);Object.assign(j,patch,{state,updatedAt:new Date().toISOString()});return structuredClone(j);}};
}