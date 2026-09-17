import http from 'node:http';
import { URL } from 'node:url';
import { routeGodotApi } from './godot-api.mjs';
import { rankAvailableGeminiModels, shouldFallbackGeminiError } from './gemini-auto-router.mjs';
import { runStableAnswer } from './stable-answer-stream.mjs';

const PORT=Number(process.env.PORT||8787);
const TIMEOUT_MS=Number(process.env.MODY_PROVIDER_TIMEOUT_MS||60000);
const MAX_BODY_BYTES=Number(process.env.MODY_MAX_BODY_BYTES||1_000_000);
const RATE_LIMIT_PER_MIN=Number(process.env.MODY_RATE_LIMIT_PER_MIN||60);
const DEFAULT_MAX_OUTPUT=Math.min(Number(process.env.MODY_MAX_OUTPUT_TOKENS||4096),8192);
const ALLOWED_ORIGINS=new Set((process.env.MODY_ALLOWED_ORIGINS||'https://sayedmah.github.io,http://localhost:3000,http://localhost:5173').split(',').map(s=>s.trim()).filter(Boolean));
const rateBuckets=new Map();
const geminiModelCache={at:0,data:[]};

const builtinProviders={
 openai:{id:'openai',label:'OpenAI',kind:'openai-responses',baseUrl:'https://api.openai.com/v1',keyEnv:'OPENAI_API_KEY',modelsPath:'/models',chatPath:'/responses'},
 anthropic:{id:'anthropic',label:'Anthropic',kind:'anthropic',baseUrl:'https://api.anthropic.com/v1',keyEnv:'ANTHROPIC_API_KEY',modelsPath:'/models',chatPath:'/messages'},
 google:{id:'google',label:'Google Gemini',kind:'gemini',baseUrl:'https://generativelanguage.googleapis.com/v1beta',keyEnv:'GEMINI_API_KEY',modelsPath:'/models',chatPath:null},
 xai:{id:'xai',label:'xAI',kind:'openai-compatible',baseUrl:'https://api.x.ai/v1',keyEnv:'XAI_API_KEY',modelsPath:'/models',chatPath:'/chat/completions'},
 mistral:{id:'mistral',label:'Mistral',kind:'openai-compatible',baseUrl:'https://api.mistral.ai/v1',keyEnv:'MISTRAL_API_KEY',modelsPath:'/models',chatPath:'/chat/completions'},
 groq:{id:'groq',label:'Groq',kind:'openai-compatible',baseUrl:'https://api.groq.com/openai/v1',keyEnv:'GROQ_API_KEY',modelsPath:'/models',chatPath:'/chat/completions'},
 openrouter:{id:'openrouter',label:'OpenRouter',kind:'openai-compatible',baseUrl:'https://openrouter.ai/api/v1',keyEnv:'OPENROUTER_API_KEY',modelsPath:'/models',chatPath:'/chat/completions',extraHeaders:()=>({...process.env.MODY_PUBLIC_URL?{'HTTP-Referer':process.env.MODY_PUBLIC_URL}:{},'X-Title':'MODY AI'})}
};

function loadGenericProviders(){
 const raw=process.env.MODY_GENERIC_PROVIDERS_JSON;if(!raw)return{};
 try{
  const arr=JSON.parse(raw);if(!Array.isArray(arr))throw new Error('must be an array');
  return Object.fromEntries(arr.map(p=>{if(!p?.id||!p?.baseUrl||!p?.keyEnv)throw new Error('generic provider requires id, baseUrl, keyEnv');const id=String(p.id).toLowerCase().replace(/[^a-z0-9_-]/g,'');return[id,{id,label:p.label||id,kind:'openai-compatible',baseUrl:String(p.baseUrl).replace(/\/$/,''),keyEnv:String(p.keyEnv),modelsPath:p.modelsPath||'/models',chatPath:p.chatPath||'/chat/completions',extraHeaders:()=>p.headers||{}}]}));
 }catch(err){console.error('Invalid MODY_GENERIC_PROVIDERS_JSON:',err.message);return{};}
}
const providers={...builtinProviders,...loadGenericProviders()};
const providerPublicView=p=>({id:p.id,label:p.label,kind:p.kind,configured:Boolean(process.env[p.keyEnv]),modelDiscovery:true});

function corsHeaders(origin){const allowOrigin=origin&&ALLOWED_ORIGINS.has(origin)?origin:(ALLOWED_ORIGINS.has('*')?'*':'');return{...(allowOrigin?{'Access-Control-Allow-Origin':allowOrigin}:{}),'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Vary':'Origin','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store'};}
function sendJson(res,status,data,origin){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...corsHeaders(origin)});res.end(JSON.stringify(data));}
function sseEvent(type,data={}){return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;}
function readJson(req){return new Promise((resolve,reject)=>{let data='',bytes=0;req.on('data',chunk=>{bytes+=chunk.length;if(bytes>MAX_BODY_BYTES){reject(Object.assign(new Error('Request body too large'),{status:413}));req.destroy();return;}data+=chunk;});req.on('end',()=>{try{resolve(data?JSON.parse(data):{});}catch{reject(Object.assign(new Error('Invalid JSON'),{status:400}));}});req.on('error',reject);});}
function checkRateLimit(ip){const minute=Math.floor(Date.now()/60000),key=`${ip}:${minute}`,count=(rateBuckets.get(key)||0)+1;rateBuckets.set(key,count);if(rateBuckets.size>5000)for(const k of rateBuckets.keys())if(!k.endsWith(`:${minute}`))rateBuckets.delete(k);return count<=RATE_LIMIT_PER_MIN;}
async function providerFetch(url,init={}){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),TIMEOUT_MS);try{const resp=await fetch(url,{...init,signal:ctrl.signal}),text=await resp.text();let data;try{data=text?JSON.parse(text):{};}catch{data={raw:text};}if(!resp.ok){const err=new Error(data?.error?.message||data?.message||`${resp.status} ${resp.statusText}`);err.status=resp.status;throw err;}return data;}finally{clearTimeout(timer);}}
function authHeaders(p){const key=process.env[p.keyEnv];if(!key)throw Object.assign(new Error(`${p.label} is not configured`),{status:503});if(p.kind==='anthropic')return{'x-api-key':key,'anthropic-version':process.env.ANTHROPIC_VERSION||'2023-06-01','content-type':'application/json'};return{Authorization:`Bearer ${key}`,'content-type':'application/json',...(p.extraHeaders?.()||{})};}
async function listModels(p){
 const key=process.env[p.keyEnv];if(!key)return[];
 if(p.kind==='gemini'&&geminiModelCache.data.length&&Date.now()-geminiModelCache.at<300000)return geminiModelCache.data;
 if(p.kind==='gemini'){
  const q=new URL(`${p.baseUrl}${p.modelsPath}`);q.searchParams.set('key',key);q.searchParams.set('pageSize','1000');
  const data=await providerFetch(q);const models=(data.models||[]).map(m=>({id:String(m.name||'').replace(/^models\//,''),name:m.displayName||m.name,provider:p.id,capabilities:m.supportedGenerationMethods||[]})).filter(m=>m.id);
  geminiModelCache.at=Date.now();geminiModelCache.data=models;return models;
 }
 const url=new URL(`${p.baseUrl}${p.modelsPath}`);if(p.kind==='anthropic')url.searchParams.set('limit','1000');
 const data=await providerFetch(url,{headers:authHeaders(p)});return(data.data||data.models||[]).map(m=>({id:m.id||m.name,name:m.display_name||m.displayName||m.name||m.id,provider:p.id,capabilities:m.capabilities||m.features||m.supported_parameters||[]})).filter(m=>m.id);
}
function normalizeMessages(messages,prompt){let list=Array.isArray(messages)?messages:[];if(!list.length&&typeof prompt==='string')list=[{role:'user',content:prompt}];return list.filter(m=>m&&['system','user','assistant'].includes(m.role)&&typeof m.content==='string').map(m=>({role:m.role,content:m.content.trim()})).filter(m=>m.content);}
function parseOpenAIResponse(data){if(typeof data.output_text==='string'&&data.output_text)return data.output_text;const parts=[];for(const item of data.output||[])for(const c of item.content||[])if(typeof c.text==='string')parts.push(c.text);return parts.join('\n').trim();}
function getProvider(id){const p=providers[String(id||'').toLowerCase()];if(!p)throw Object.assign(new Error('Unknown provider'),{status:404});return p;}
function normalizeWebChatBody(body={}){const provider=String(body.provider||'google').trim().toLowerCase()||'google';let model=String(body.model||'').trim();if(!model||model==='demo:mock')model=provider==='google'?'auto':model;const prompt=typeof body.prompt==='string'?body.prompt:(typeof body.message==='string'?body.message:'');return{...body,provider,model,prompt};}
function isUsableGeminiTextModel(m){return m&&m.id&&Array.isArray(m.capabilities)&&m.capabilities.includes('generateContent')&&!/image|tts|live|audio|embed|embedding|veo|lyria|robot|computer-use/i.test(m.id);}
function geminiCandidates(body,available){
 const requested=String(body.model||'auto').trim();
 const ranked=rankAvailableGeminiModels(available);
 const discovered=available.filter(isUsableGeminiTextModel).map(m=>m.id);
 const preferred=[...ranked,'gemini-2.5-flash','gemini-2.5-pro','gemini-flash-latest','gemini-pro-latest',...discovered].filter((v,i,a)=>v&&a.indexOf(v)===i&&discovered.includes(v));
 return requested&&requested!=='auto'?[requested,...preferred.filter(x=>x!==requested)]:preferred;
}
async function chat(p,body){
 const model=String(body.model||'').trim();if(!model||model==='auto')throw Object.assign(new Error('A real model id is required'),{status:400});
 const messages=normalizeMessages(body.messages,body.prompt);if(!messages.length)throw Object.assign(new Error('At least one message is required'),{status:400});
 const maxTokens=Math.max(1,Math.min(Number(body.max_output_tokens||DEFAULT_MAX_OUTPUT),8192));
 if(p.kind==='openai-responses'){const data=await providerFetch(`${p.baseUrl}${p.chatPath}`,{method:'POST',headers:authHeaders(p),body:JSON.stringify({model,input:messages,max_output_tokens:maxTokens})});return{text:parseOpenAIResponse(data),usage:data.usage||null,rawId:data.id||null};}
 if(p.kind==='anthropic'){const system=messages.filter(m=>m.role==='system').map(m=>m.content).join('\n\n'),nonSystem=messages.filter(m=>m.role!=='system'),payload={model,max_tokens:maxTokens,messages:nonSystem};if(system)payload.system=system;const data=await providerFetch(`${p.baseUrl}${p.chatPath}`,{method:'POST',headers:authHeaders(p),body:JSON.stringify(payload)});return{text:(data.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n'),usage:data.usage||null,rawId:data.id||null};}
 if(p.kind==='gemini'){
  const systemText=messages.filter(m=>m.role==='system').map(m=>m.content).join('\n\n');
  const contents=messages.filter(m=>m.role!=='system').map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]}));
  const url=new URL(`${p.baseUrl}/models/${encodeURIComponent(model)}:generateContent`);url.searchParams.set('key',process.env[p.keyEnv]);
  const payload={contents,generationConfig:{maxOutputTokens:maxTokens}};if(systemText)payload.systemInstruction={parts:[{text:systemText}]};
  const data=await providerFetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  return{text:(data.candidates?.[0]?.content?.parts||[]).map(x=>x.text||'').join('\n'),usage:data.usageMetadata||null,rawId:null};
 }
 const payload={model,messages,max_tokens:maxTokens};if(typeof body.temperature==='number')payload.temperature=Math.max(0,Math.min(body.temperature,2));
 const data=await providerFetch(`${p.baseUrl}${p.chatPath}`,{method:'POST',headers:authHeaders(p),body:JSON.stringify(payload)});const text=data.choices?.[0]?.message?.content??data.choices?.[0]?.text??'';return{text:typeof text==='string'?text:JSON.stringify(text),usage:data.usage||null,rawId:data.id||null};
}
async function autoGeminiChat(body){
 const p=providers.google;if(!process.env[p.keyEnv])throw Object.assign(new Error('Google Gemini is not configured'),{status:503});
 const candidates=geminiCandidates(body,await listModels(p));if(!candidates.length)throw Object.assign(new Error('No Gemini generateContent model is currently available'),{status:503});
 const attempts=[];
 for(const model of candidates){const started=Date.now();try{const out=await chat(p,{...body,model});if(!String(out.text||'').trim())throw Object.assign(new Error('Model returned an empty final answer'),{status:502});return{provider:'google',model,latency_ms:Date.now()-started,...out,response:out.text,attempts};}catch(err){attempts.push({model,status:Number(err.status||500),error:err.message});if(!shouldFallbackGeminiError(err))throw err;}}
 const err=Object.assign(new Error('All available Gemini models failed to answer'),{status:503,attempts});throw err;
}
async function stableGeminiSse(req,res,body,origin){
 const p=providers.google;if(!process.env[p.keyEnv])return sendJson(res,503,{error:'Google Gemini is not configured'},origin);
 const candidates=geminiCandidates(body,await listModels(p));if(!candidates.length)return sendJson(res,503,{error:'No Gemini generateContent model is currently available'},origin);
 res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Connection':'keep-alive','X-Accel-Buffering':'no',...corsHeaders(origin)});res.flushHeaders?.();
 let closed=false;res.on('close',()=>{if(!res.writableEnded)closed=true;});
 const emit=(type,data)=>{if(!closed&&!res.writableEnded)res.write(sseEvent(type,data));};
 try{
  await runStableAnswer({candidates,body,generate:(model,requestBody)=>chat(p,{...requestBody,model}),shouldFallback:shouldFallbackGeminiError,emit});
  if(!closed&&!res.writableEnded)res.end();
 }catch(err){if(closed)return;emit('error',{message:err.message,attempts:err.attempts||[]});res.end();}
}
async function gameStudioAI({provider='google',model='auto',prompt,max_output_tokens}){if(provider==='google'&&(!model||model==='auto'))return autoGeminiChat({model:'auto',prompt,max_output_tokens});return chat(getProvider(provider),{model,prompt,max_output_tokens});}
async function queueGodotBuild(job){const base=String(process.env.MODY_GODOT_WORKER_URL||'').replace(/\/$/,'');if(!base)throw Object.assign(new Error('Godot worker is not configured'),{status:503});const headers={'content-type':'application/json'};if(process.env.MODY_GODOT_WORKER_TOKEN)headers.authorization=`Bearer ${process.env.MODY_GODOT_WORKER_TOKEN}`;return providerFetch(`${base}/v1/builds`,{method:'POST',headers,body:JSON.stringify(job)});}
async function handle(req,res){
 const origin=req.headers.origin||'';if(req.method==='OPTIONS'){res.writeHead(204,corsHeaders(origin));return res.end();}
 if(!checkRateLimit(req.socket.remoteAddress||'unknown'))return sendJson(res,429,{error:'Rate limit exceeded'},origin);
 const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
 if(req.method==='GET'&&url.pathname==='/health')return sendJson(res,200,{ok:true,service:'MODY AI Backend',version:'0.5.3',answerEngine:'generateContent',streamingTransport:'sse-wrapper',autoRouting:true,thoughtSummaries:false,googleSearch:false,gameStudio:true,godotWorkerConfigured:Boolean(process.env.MODY_GODOT_WORKER_URL),providers:Object.values(providers).filter(p=>process.env[p.keyEnv]).map(p=>p.id)},origin);
 if(req.method==='GET'&&url.pathname==='/v1/providers')return sendJson(res,200,{data:Object.values(providers).map(providerPublicView)},origin);
 if(req.method==='GET'&&url.pathname==='/v1/models'){const providerId=url.searchParams.get('provider'),selected=providerId?[getProvider(providerId)]:Object.values(providers).filter(p=>process.env[p.keyEnv]),settled=await Promise.allSettled(selected.map(async p=>({provider:p.id,models:await listModels(p)}))),data=[],errors=[];settled.forEach((r,i)=>r.status==='fulfilled'?data.push(...r.value.models):errors.push({provider:selected[i].id,error:r.reason?.message||'Model sync failed'}));return sendJson(res,200,{data,models:data,auto_priority:providerId==='google'?rankAvailableGeminiModels(data):[],errors},origin);}
 if(req.method==='POST'&&url.pathname==='/v1/chat/stream'){const body=normalizeWebChatBody(await readJson(req));if(body.provider!=='google')return sendJson(res,400,{error:'Stable chat stream currently supports Google Gemini only'},origin);return stableGeminiSse(req,res,body,origin);}
 if(req.method==='POST'&&url.pathname==='/v1/chat'){const body=normalizeWebChatBody(await readJson(req)),p=getProvider(body.provider),started=Date.now();if(p.id==='google'&&body.model==='auto'){const result=await autoGeminiChat(body);return sendJson(res,200,result,origin);}const result=await chat(p,body);return sendJson(res,200,{provider:p.id,model:body.model,latency_ms:Date.now()-started,...result,response:result.text},origin);}
 if(req.method==='POST'&&url.pathname==='/v1/multi-ai'){const body=await readJson(req);if(!Array.isArray(body.targets)||body.targets.length<2||body.targets.length>8)return sendJson(res,400,{error:'targets must contain 2-8 {provider, model} entries'},origin);const messages=normalizeMessages(body.messages,body.prompt),results=await Promise.all(body.targets.map(async target=>{const started=Date.now();try{const p=getProvider(target.provider),out=p.id==='google'&&target.model==='auto'?await autoGeminiChat({...body,messages,model:'auto'}):await chat(p,{...body,model:target.model,messages});return{ok:true,provider:p.id,model:out.model||target.model,latency_ms:Date.now()-started,...out};}catch(err){return{ok:false,provider:target.provider,model:target.model,latency_ms:Date.now()-started,error:err.message};}}));return sendJson(res,200,{independent:true,results},origin);}
 const match=req.method==='POST'&&url.pathname.match(/^\/v1\/game-studio\/(create|repair|build)$/);if(match){const body=await readJson(req),result=await routeGodotApi(match[1],body,{ai:gameStudioAI,queueBuild:queueGodotBuild});return sendJson(res,result.status,result.body,origin);}
 return sendJson(res,404,{error:'Not found'},origin);
}
const server=http.createServer((req,res)=>{handle(req,res).catch(err=>{const origin=req.headers.origin||'',status=Number(err.status)>=400&&Number(err.status)<600?Number(err.status):500;console.error(err);if(!res.headersSent)sendJson(res,status,{error:status===500?'Internal server error':err.message,attempts:err.attempts||undefined},origin);else res.end();});});
server.listen(PORT,'0.0.0.0',()=>{console.log(`MODY AI Backend listening on :${PORT} — stable generateContent answer engine enabled`);console.log('Configured providers:',Object.values(providers).filter(p=>process.env[p.keyEnv]).map(p=>p.id).join(', ')||'(none)');});
