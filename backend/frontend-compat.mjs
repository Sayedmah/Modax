const DEFAULT_MODELS={google:'gemini-2.5-flash'};

export function normalizeFrontendChat(body={},configuredProviders=[]){
  const configured=new Set(configuredProviders.map(String));
  let provider=String(body.provider||'').trim().toLowerCase();
  if(!provider){
    if(configured.size===1) provider=[...configured][0];
    else if(configured.has('google')) provider='google';
  }
  const prompt=typeof body.prompt==='string'&&body.prompt.trim()?body.prompt.trim():String(body.message||'').trim();
  let model=String(body.model||'').trim();
  if(!model||model==='auto'||model==='demo:mock') model=DEFAULT_MODELS[provider]||'';
  return {...body,provider,prompt,model};
}