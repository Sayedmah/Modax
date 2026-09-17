const CACHE='mody-ai-web-v4';
const ASSETS=['./','./index.html','./manifest.webmanifest','./mody-icon.svg'];
const MODY_BACKEND='https://modaxai.onrender.com';

self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));

async function bridgeBackend(request){
  const original=new URL(request.url);
  if(original.origin!==MODY_BACKEND)return fetch(request);

  if(request.method==='POST'&&original.pathname.endsWith('/v1/chat')){
    const body=await request.clone().json().catch(()=>({}));
    const payload={...body,provider:body.provider||'google',model:body.model||'auto',prompt:body.prompt||body.message||'',messages:body.messages};
    return fetch(`${MODY_BACKEND}/v1/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  }

  if(request.method==='GET'&&original.pathname.endsWith('/v1/models')){
    const url=new URL(`${MODY_BACKEND}/v1/models`);
    url.searchParams.set('provider',original.searchParams.get('provider')||'google');
    return fetch(url.toString(),{headers:{'Accept':'application/json'}});
  }

  if(request.method==='GET'&&original.pathname.endsWith('/health'))return fetch(`${MODY_BACKEND}/health`,{headers:{'Accept':'application/json'}});
  return fetch(request);
}

self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.origin===MODY_BACKEND){event.respondWith(bridgeBackend(event.request));return;}
  if(event.request.method!=='GET')return;
  event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;}).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html'))));
});