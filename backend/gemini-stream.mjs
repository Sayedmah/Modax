export function buildInteractionInput(messages=[],prompt=''){
 const list=Array.isArray(messages)?messages:[];
 const clean=list.filter(m=>m&&typeof m.content==='string'&&m.content.trim()).map(m=>({role:m.role,content:m.content.trim()}));
 if(!clean.length&&String(prompt||'').trim())clean.push({role:'user',content:String(prompt).trim()});
 return clean.map(m=>`${m.role==='assistant'?'MODY':m.role==='system'?'تعليمات النظام':'المستخدم'}: ${m.content}`).join('\n\n');
}

function citations(items=[]){return items.filter(a=>a?.type==='url_citation'&&a.url).map(a=>({url:a.url,title:a.title||a.url}))}
function contentEvent(content=[]){
 const text=content.filter(x=>x?.type==='text'&&x.text).map(x=>x.text).join('');
 const sources=content.flatMap(x=>citations(x?.annotations||[]));
 if(text)return {type:'text',text,...(sources.length?{sources}:{})};
 if(sources.length)return {type:'sources',sources};
 return null;
}
export function parseGoogleSseBlock(block=''){
 const dataLines=String(block).split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim());
 if(!dataLines.length)return null;const raw=dataLines.join('\n');if(raw==='[DONE]')return {type:'done'};
 let event;try{event=JSON.parse(raw)}catch{return null}
 if(event.event_type==='step.start'){
  const step=event.step||{};
  if(step.type==='model_output')return contentEvent(step.content||[]);
  if(step.type==='thought'){const text=(step.summary||[]).filter(x=>x?.type==='text'&&x.text).map(x=>x.text).join('');return text?{type:'thought',text}:null}
  if(step.type==='google_search_call')return {type:'search',queries:step.arguments?.queries||step.arguments?.query?[...(step.arguments?.queries||[]),...(step.arguments?.query?[step.arguments.query]:[])]:[]};
  if(step.type==='google_search_result')return {type:'search_result'};
 }
 if(event.event_type==='step.delta'){
  const d=event.delta||{};
  if(d.type==='thought_summary'&&d.content?.type==='text'&&d.content.text)return {type:'thought',text:d.content.text};
  if(d.type==='text'){
   const sources=citations(d.annotations||[]);if(d.text)return {type:'text',text:d.text,...(sources.length?{sources}:{})};if(sources.length)return {type:'sources',sources};
  }
  if(d.type==='google_search_call')return {type:'search',queries:d.arguments?.queries||[]};
  if(d.type==='google_search_result')return {type:'search_result'};
  return null;
 }
 if(event.event_type==='interaction.created')return {type:'model',model:event.interaction?.model||''};
 if(event.event_type==='interaction.completed')return {type:'done',usage:event.interaction?.usage||null};
 return null;
}
export function sseEvent(type,data={}){return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;}
