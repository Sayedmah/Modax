const CACHE='mody-ai-web-v2';
const ASSETS=['./','./index.html','./manifest.webmanifest','./mody-icon.svg'];
const MODY_BACKEND='https://modaxai.onrender.com';

self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));

async function bridgeBackend(request){
  const url=new URL(request.url);
  if(url.origin!==MODY_BACKEND)return null;

  if(request.method==='POST'&&url.pathname==='/v1/chat'){
    const body=await request.clone().json().catch(()=>({}));
    const model=body.model&&body.model!=='auto'&&body.model!=='demo:mock'?body.model:'gemini-2.5-flash';
    const payload={...body,provider:body.provider||'google',model,prompt:body.prompt||body.message||'',messages:body.messages};
    const response=await fetch(request.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await response.clone().json().catch(()=>null);
    if(!data)return response;
    return new Response(JSON.stringify({...data,response:data.response||data.text||data.output||data.message||''}),{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }

  if(request.method==='GET'&&url.pathname==='/v1/models'){
    if(!url.searchParams.has('provider'))url.searchParams.set('provider','google');
    const response=await fetch(url.toString(),{headers:{'Accept':'application/json'}});
    const data=await response.clone().json().catch(()=>null);
    if(!data)return response;
    const models=Array.isArray(data)?data:(data.models||data.data||[]);
    return new Response(JSON.stringify({...data,models}),{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }

  return fetch(request);
}

self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.origin===MODY_BACKEND){event.respondWith(bridgeBackend(event.request));return;}
  if(event.request.method!=='GET')return;
  event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;}).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html'))));
});