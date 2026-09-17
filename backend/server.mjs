import http from 'node:http';
import { URL } from 'node:url';
import { routeGodotApi } from './godot-api.mjs';
import { rankAvailableGeminiModels, shouldFallbackGeminiError } from './gemini-auto-router.mjs';
import { buildInteractionInput, drainGoogleSseBuffer, sseEvent } from './gemini-stream.mjs';
import { ensureFinalAnswer } from './final-answer-fallback.mjs';

const PORT=Number(process.env.PORT||8787);
const TIMEOUT_MS=Number(process.env.MODY_PROVIDER_TIMEOUT_MS||60000);
const MAX_BODY_BYTES=Number(process.env.MODY_MAX_BODY_BYTES||1_000_000);
const RATE_LIMIT_PER_MIN=Number(process.env.MODY_RATE_LIMIT_PER_MIN||60);
const DEFAULT_MAX_OUTPUT=Math.min(Number(process.env.MODY_MAX_OUTPUT_TOKENS||4096),8192);
const ALLOWED_ORIGINS=new Set((process.env.MODY_ALLOWED_ORIGINS||'https://sayedmah.github.io,http://localhost:3000,http://localhost:5173').split(',').map(s=>s.trim()).filter(Boolean));
const rateBuckets=new Map();
const providers={google:{id:'google',label:'Google Gemini',kind:'gemini',baseUrl:'https://generativelanguage.googleapis.com/v1beta',keyEnv:'GEMINI_API_KEY',modelsPath:'/models'}};
let modelCache={at:0,data:[]};

function corsHeaders(origin){
 const allowOrigin=origin&&ALLOWED_ORIGINS.has(origin)?origin:(ALLOWED_ORIGINS.has('*')?'*':'');
 return{...(allowOrigin?{'Access-Control-Allow-Origin':allowOrigin}:{}),'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Vary':'Origin','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'};
}
function sendJson(res,status,data,origin){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...corsHeaders(origin)});res.end(JSON.stringify(data));}
function readJson(req){return new Promise((resolve,reject)=>{let data='',bytes=0;req.on('data',chunk=>{bytes+=chunk.length;if(bytes>MAX_BODY_BYTES){reject(Object.assign(new Error('Request body too large'),{status:413}));req.destroy();return;}data+=chunk;});req.on('end',()=>{try{resolve(data?JSON.parse(data):{});}catch{reject(Object.assign(new Error('Invalid JSON'),{status:400}));}});req.on('error',reject);});}
function checkRateLimit(ip){const minute=Math.floor(Date.now()/60000),key=`${ip}:${minute}`,count=(rateBuckets.get(key)||0)+1;rateBuckets.set(key,count);return count<=RATE_LIMIT_PER_MIN;}
async function providerFetch(url,init={}){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),TIMEOUT_MS);try{const resp=await fetch(url,{...init,signal:ctrl.signal}),text=await resp.text();let data;try{data=text?JSON.parse(text):{};}catch{data={raw:text};}if(!resp.ok){const err=new Error(data?.error?.message||data?.message||`${resp.status} ${resp.statusText}`);err.status=resp.status;throw err;}return data;}finally{clearTimeout(timer);}}
async function listModels(p){if(modelCache.data.length&&Date.now()-modelCache.at<300000)return modelCache.data;const key=process.env[p.keyEnv];if(!key)return[];const q=new URL(`${p.baseUrl}${p.modelsPath}`);q.searchParams.set('key',key);q.searchParams.set('pageSize','1000');const data=await providerFetch(q);const models=(data.models||[]).map(m=>({id:String(m.name||'').replace(/^models\//,''),name:m.displayName||m.name,provider:p.id,capabilities:m.supportedGenerationMethods||[]})).filter(m=>m.id);modelCache={at:Date.now(),data:models};return models;}
function normalizeMessages(messages,prompt){let list=Array.isArray(messages)?messages:[];if(!list.length&&typeof prompt==='string')list=[{role:'user',content:prompt}];return list.filter(m=>m&&['system','user','assistant'].includes(m.role)&&typeof m.content==='string').map(m=>({role:m.role,content:m.content.trim()})).filter(m=>m.content);}
function candidatesFor(body,available){const ranked=rankAvailableGeminiModels(available),requested=String(body.model||'auto').trim();return requested&&requested!=='auto'?[requested,...ranked.filter(x=>x!==requested)]:ranked;}
async function chatGemini(p,body,model){
 const messages=normalizeMessages(body.messages,body.prompt);
 if(!messages.length)throw Object.assign(new Error('At least one message is required'),{status:400});
 const contents=messages.filter(m=>m.role!=='system').map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]}));
 const systemText=messages.filter(m=>m.role==='system').map(m=>m.content).join('\n\n');
 const url=new URL(`${p.baseUrl}/models/${encodeURIComponent(model)}:generateContent`);url.searchParams.set('key',process.env[p.keyEnv]);
 const payload={contents,generationConfig:{maxOutputTokens:Math.max(1,Math.min(Number(body.max_output_tokens||DEFAULT_MAX_OUTPUT),8192))}};
 if(systemText)payload.systemInstruction={parts:[{text:systemText}]};
 const data=await providerFetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
 return{text:(data.candidates?.[0]?.content?.parts||[]).map(x=>x.text||'').join('\n'),usage:data.usageMetadata||null};
}
async function autoGeminiChat(body){
 const p=providers.google;
 if(!process.env[p.keyEnv])throw Object.assign(new Error('Google Gemini is not configured'),{status:503});
 const candidates=candidatesFor(body,await listModels(p)),attempts=[];
 if(!candidates.length)throw Object.assign(new Error('No supported Gemini text models are currently available'),{status:503});
 for(const model of candidates){const started=Date.now();try{const result=await chatGemini(p,body,model);if(!String(result.text||'').trim())throw Object.assign(new Error('Model returned an empty final answer'),{status:502});return{provider:'google',model,latency_ms:Date.now()-started,...result,response:result.text,attempts};}catch(err){attempts.push({model,status:Number(err.status||500),error:err.message});if(!shouldFallbackGeminiError(err))throw err;}}
 const err=Object.assign(new Error('All available Gemini models are temporarily unavailable'),{status:503});err.attempts=attempts;throw err;
}
async function streamGemini(req,res,body,origin){
 const p=providers.google,key=process.env[p.keyEnv];
 if(!key)return sendJson(res,503,{error:'Google Gemini is not configured'},origin);
 const messages=normalizeMessages(body.messages,body.prompt);
 if(!messages.length)return sendJson(res,400,{error:'At least one message is required'},origin);
 const candidates=candidatesFor(body,await listModels(p));
 if(!candidates.length)return sendJson(res,503,{error:'No supported Gemini text models are currently available'},origin);
 res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Connection':'keep-alive','X-Accel-Buffering':'no',...corsHeaders(origin)});res.flushHeaders?.();
 const attempts=[];let closed=false,activeCtrl=null;
 res.on('close',()=>{if(!res.writableEnded){closed=true;activeCtrl?.abort();}});
 res.write(sseEvent('status',{stage:'routing',message:'اختيار أفضل نموذج متاح',candidates}));
 for(const model of candidates){
  if(closed)return;
  res.write(sseEvent('status',{stage:'model',model,message:`${model} يعمل الآن`}));
  const ctrl=new AbortController();activeCtrl=ctrl;const timer=setTimeout(()=>ctrl.abort(),TIMEOUT_MS);
  let streamedText='';
  try{
   const requestBody={model,input:buildInteractionInput(messages,body.prompt),stream:true,generation_config:{thinking_summaries:'auto'},tools:[{type:'google_search'}]};
   const upstream=await fetch(`${p.baseUrl}/interactions?alt=sse`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body:JSON.stringify(requestBody),signal:ctrl.signal});
   if(!upstream.ok){const raw=await upstream.text();let parsed={};try{parsed=JSON.parse(raw);}catch{}const err=new Error(parsed?.error?.message||`${upstream.status} ${upstream.statusText}`);err.status=upstream.status;throw err;}
   res.write(sseEvent('model',{model}));
   const reader=upstream.body.getReader(),decoder=new TextDecoder();let buffer='';
   const handleEvent=event=>{if(!event)return;if(event.type==='thought')res.write(sseEvent('thought',{text:event.text}));else if(event.type==='text'){streamedText+=event.text||'';res.write(sseEvent('text',{text:event.text,sources:event.sources||[]}));}else if(event.type==='sources')res.write(sseEvent('sources',{sources:event.sources||[]}));else if(event.type==='search')res.write(sseEvent('search',{queries:event.queries||[]}));else if(event.type==='search_result')res.write(sseEvent('status',{stage:'search_result',message:'تمت مراجعة نتائج البحث'}));else if(event.type==='done'&&event.usage)res.write(sseEvent('usage',{usage:event.usage}));};
   while(!closed){
    const {value,done}=await reader.read();if(done)break;
    buffer+=decoder.decode(value,{stream:true});
    const drained=drainGoogleSseBuffer(buffer,false);buffer=drained.buffer;
    for(const event of drained.events)handleEvent(event);
   }
   if(!closed){
    buffer+=decoder.decode();
    const finalDrain=drainGoogleSseBuffer(buffer,true);
    for(const event of finalDrain.events)handleEvent(event);
   }
   clearTimeout(timer);
   if(closed)return;
   const final=await ensureFinalAnswer({streamText:streamedText,model,body,generate:(selectedModel,requestBody)=>chatGemini(p,requestBody,selectedModel),emitStatus:data=>res.write(sseEvent('status',data)),emitText:data=>res.write(sseEvent('text',data))});
   if(final.fallback&&final.usage)res.write(sseEvent('usage',{usage:final.usage}));
   res.write(sseEvent('done',{model:final.model||model,attempts,fallback:final.fallback}));res.end();return;
  }catch(err){
   clearTimeout(timer);if(closed)return;
   const status=Number(err.status||0);attempts.push({model,status:status||500,error:err.name==='AbortError'?'Provider timeout':err.message});
   if(!shouldFallbackGeminiError({status:status||408,message:err.message})&&err.name!=='AbortError'){res.write(sseEvent('error',{message:err.message,model,attempts}));res.end();return;}
   const next=candidates[candidates.indexOf(model)+1];res.write(sseEvent('status',{stage:'fallback',model,next,message:next?`${model} غير متاح — الانتقال إلى ${next}`:`${model} غير متاح`}));
  }
 }
 if(!closed){res.write(sseEvent('error',{message:'كل نماذج Gemini المتاحة مشغولة أو غير متاحة حاليًا',attempts}));res.end();}
}
async function gameStudioAI({provider='google',model='auto',prompt,max_output_tokens}){if(provider==='google')return autoGeminiChat({model,prompt,max_output_tokens});throw Object.assign(new Error('Provider is not configured'),{status:503});}
async function queueGodotBuild(job){const base=String(process.env.MODY_GODOT_WORKER_URL||'').replace(/\/$/,'');if(!base)throw Object.assign(new Error('Godot worker is not configured'),{status:503});const headers={'content-type':'application/json'};if(process.env.MODY_GODOT_WORKER_TOKEN)headers.authorization=`Bearer ${process.env.MODY_GODOT_WORKER_TOKEN}`;return providerFetch(`${base}/v1/builds`,{method:'POST',headers,body:JSON.stringify(job)});}
async function handle(req,res){
 const origin=req.headers.origin||'';
 if(req.method==='OPTIONS'){res.writeHead(204,corsHeaders(origin));return res.end();}
 if(!checkRateLimit(req.socket.remoteAddress||'unknown'))return sendJson(res,429,{error:'Rate limit exceeded'},origin);
 const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
 if(req.method==='GET'&&url.pathname==='/health')return sendJson(res,200,{ok:true,service:'MODY AI Backend',version:'0.5.3',autoRouting:true,streaming:true,thoughtSummaries:true,googleSearch:true,finalAnswerFallback:true,robustSseFraming:true,providers:process.env.GEMINI_API_KEY?['google']:[]},origin);
 if(req.method==='GET'&&url.pathname==='/v1/providers')return sendJson(res,200,{data:[{id:'google',label:'Google Gemini',kind:'gemini',configured:Boolean(process.env.GEMINI_API_KEY),modelDiscovery:true,streaming:true,googleSearch:true}]},origin);
 if(req.method==='GET'&&url.pathname==='/v1/models'){const data=await listModels(providers.google);return sendJson(res,200,{data,models:data,auto_priority:rankAvailableGeminiModels(data),errors:[]},origin);}
 if(req.method==='POST'&&url.pathname==='/v1/chat/stream'){const raw=await readJson(req);return streamGemini(req,res,{...raw,prompt:typeof raw.prompt==='string'?raw.prompt:(raw.message||''),model:raw.model||'auto'},origin);}
 if(req.method==='POST'&&url.pathname==='/v1/chat'){const raw=await readJson(req);const result=await autoGeminiChat({...raw,prompt:typeof raw.prompt==='string'?raw.prompt:(raw.message||''),model:raw.model||'auto'});return sendJson(res,200,result,origin);}
 if(req.method==='POST'&&url.pathname==='/v1/multi-ai'){const body=await readJson(req),prompt=body.prompt||body.message||'',available=rankAvailableGeminiModels(await listModels(providers.google)).slice(0,Math.max(2,Math.min(Number(body.count||3),5))),results=await Promise.all(available.map(async model=>{try{return{ok:true,...await autoGeminiChat({prompt,model})};}catch(err){return{ok:false,provider:'google',model,error:err.message};}}));return sendJson(res,200,{independent:true,results},origin);}
 const match=req.method==='POST'&&url.pathname.match(/^\/v1\/game-studio\/(create|repair|build)$/);if(match){const body=await readJson(req),result=await routeGodotApi(match[1],body,{ai:gameStudioAI,queueBuild:queueGodotBuild});return sendJson(res,result.status,result.body,origin);}
 return sendJson(res,404,{error:'Not found'},origin);
}
const server=http.createServer((req,res)=>{handle(req,res).catch(err=>{const origin=req.headers.origin||'',status=Number(err.status)>=400&&Number(err.status)<600?Number(err.status):500;console.error(err);if(!res.headersSent)sendJson(res,status,{error:status===500?'Internal server error':err.message,attempts:err.attempts||undefined},origin);else res.end();});});
server.listen(PORT,'0.0.0.0',()=>console.log(`MODY AI Backend listening on :${PORT} — robust streaming + guaranteed final answer fallback enabled`));
