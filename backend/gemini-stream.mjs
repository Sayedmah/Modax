export function buildInteractionInput(messages=[],prompt=''){
 const list=Array.isArray(messages)?messages:[];
 const clean=list.filter(m=>m&&typeof m.content==='string'&&m.content.trim()).map(m=>({role:m.role,content:m.content.trim()}));
 if(!clean.length&&String(prompt||'').trim())clean.push({role:'user',content:String(prompt).trim()});
 return clean.map(m=>`${m.role==='assistant'?'MODY':m.role==='system'?'تعليمات النظام':'المستخدم'}: ${m.content}`).join('\n\n');
}

export function parseGoogleSseBlock(block=''){
 const dataLines=String(block).split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim());
 if(!dataLines.length)return null;
 const raw=dataLines.join('\n');
 if(raw==='[DONE]')return {type:'done'};
 let event;try{event=JSON.parse(raw)}catch{return null}
 if(event.event_type==='step.delta'){
  const delta=event.delta||{};
  if(delta.type==='thought_summary'&&delta.content?.type==='text'&&delta.content.text)return {type:'thought',text:delta.content.text};
  if(delta.type==='text'&&delta.text)return {type:'text',text:delta.text};
  return null;
 }
 if(event.event_type==='interaction.created')return {type:'model',model:event.interaction?.model||''};
 if(event.event_type==='interaction.completed')return {type:'done',usage:event.interaction?.usage||null};
 return null;
}

export function sseEvent(type,data={}){
 return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}