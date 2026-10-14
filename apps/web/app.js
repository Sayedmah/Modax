'use strict';
const $ = id => document.getElementById(id);
let token = sessionStorage.getItem('modax-token') || '';
let chatId = null, currentChat = null, controller = null, sessionEpoch = 0;
const requests = new Set();
function resetOwnerView() {
  sessionEpoch++; controller?.abort(); controller=null;
  for(const request of requests) request.abort(); requests.clear();
  chatId=null; currentChat=null;
  for(const id of ['messages','chat-list','coder-result','game-result','memory-list','usage-list','model','file-list','file-hits','arena-results','provider-list','arena-models','task-history']) $(id).replaceChildren();
  for(const id of ['prompt','code-goal','memory-text','search','provider-key','provider-model','file-search']) $(id).value='';
  $('execute-tests').checked=false;$('review-confirm').checked=false;$('code-mode').value='FAST';$('document-file').value='';$('chat-import-file').value='';$('chat-attachment').replaceChildren();$('use-memory').checked=false;$('daily-requests').value='100';$('arena-confirm').checked=false;$('arena-template').value='{task}'; $('stop').hidden=true; $('send').disabled=false;
  $('chat-title').textContent='مساحة للتفكير والبناء'; notify('');
  for(const panel of document.querySelectorAll('.view')) panel.hidden=panel.id!=='view-chat';
  for(const nav of document.querySelectorAll('.nav')) nav.classList.toggle('active',nav.dataset.view==='chat');
  $('view-title').textContent='المحادثة';
}
const titleMap = {chat:'المحادثة',coder:'Coder',game:'Game Forge',memory:'الذاكرة',usage:'الاستخدام',files:'الملفات',arena:'Model Arena',settings:'الإعدادات',tasks:'سجل المهام'};
function notify(text, error=false) { $('notice').textContent=text; $('notice').className=error?'error':''; }
async function api(path, options={}) {
  const epoch=sessionEpoch, requestController=new AbortController(); requests.add(requestController);
  const signal=options.signal?AbortSignal.any([options.signal,requestController.signal]):requestController.signal;
  let response; try { response = await fetch('/api/v1'+path,{...options,signal,headers:{...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),'Authorization':'Bearer '+token,...options.headers}}); } catch(error) {requests.delete(requestController);throw error;}
  if(epoch!==sessionEpoch) throw new Error('Session changed');
  if(!response.ok) {requests.delete(requestController);
    let detail='HTTP '+response.status;
    try { const data=await response.json(); detail=typeof data.detail==='string'?data.detail:JSON.stringify(data.detail); } catch {}
    if(response.status===401 && token) { resetOwnerView(); token=''; sessionStorage.removeItem('modax-token'); $('auth').hidden=false; $('app').hidden=true; }
    throw new Error(detail);
  }
  const originalJson=response.json.bind(response), originalBlob=response.blob.bind(response);
  response.json=async()=>{try{const data=await originalJson();if(epoch!==sessionEpoch)throw Error('Session changed');return data;}finally{requests.delete(requestController);}};
  response.blob=async()=>{try{const data=await originalBlob();if(epoch!==sessionEpoch)throw Error('Session changed');return data;}finally{requests.delete(requestController);}};
  if(response.status===204)requests.delete(requestController);
  if(path.includes('/messages')&&options.method==='POST') response.modaxController=requestController;
  return response;
}
const post = async (path, data) => (await api(path,{method:'POST',body:JSON.stringify(data)}));
function safe(handler) { return async event => { try { await handler(event); } catch(error) { notify(error.message,true); } }; }
function message(role,content,status='') {
  const box=document.createElement('article');box.className='message '+role;
  const label=document.createElement('small');label.textContent=(role==='user'?'أنت':'MODAX')+(status?' · '+status:'');
  const body=document.createElement(role==='assistant'?'div':'pre');body.textContent=content;box.append(label,body);$('messages').append(box);
  $('messages').scrollTop=$('messages').scrollHeight;
  return {box,body,label};
}
async function history() {
  const chats=await (await api('/chats?q='+encodeURIComponent($('search').value))).json();
  $('chat-list').replaceChildren();
  for(const chat of chats) { const button=document.createElement('button');button.className='history-item'+(chat.id===chatId?' selected':'');button.textContent=chat.title;button.onclick=safe(()=>openChat(chat.id));$('chat-list').append(button); }
}
async function openChat(id) {
  if(controller) throw new Error('أوقف الرد الجاري قبل تغيير المحادثة');
  currentChat=await (await api('/chats/'+id)).json();chatId=id;$('chat-title').textContent=currentChat.title;$('messages').replaceChildren();
  for(const m of currentChat.messages) message(m.role,m.content,m.status);
  await history();
}
async function enter() {
  $('auth').hidden=true;$('app').hidden=false;
  const models=await (await api('/models')).json();$('model').replaceChildren();$('arena-models').replaceChildren();
  const auto=document.createElement('option');auto.value='auto';auto.textContent='AUTO';$('model').append(auto);
  for(const m of models){const o=document.createElement('option');o.value=m.id;o.textContent=m.demo?'DEMO / محاكى':m.model;$('model').append(o);$('arena-models').append(o.cloneNode(true));}
  $('model').onchange=()=>{$('demo-banner').hidden=!models.some(m=>m.demo&&(m.id===$('model').value||($('model').value==='auto'&&!models.some(x=>!x.demo))));};$('model').onchange();
  await history();await documents();const health=await(await api('/health')).json();if(health.persistence==='local')notify('تنبيه: حفظ البيانات السحابي الدائم ينتظر ربط PostgreSQL؛ صدّر المحادثات المهمة قبل إعادة تشغيل الخدمة.');
}
async function authenticate(register=false) {
  $('auth-error').textContent='';
  try {const data=await (await post('/auth/'+(register?'register':'login'),{username:$('username').value,password:$('password').value})).json();resetOwnerView();token=data.token;sessionStorage.setItem('modax-token',token);$('password').value='';await enter();}
  catch(error){$('auth-error').textContent=error.message;}
}
$('auth-form').onsubmit=e=>{e.preventDefault();authenticate();};$('register').onclick=()=>authenticate(true);
$('logout').onclick=safe(async()=>{await post('/auth/logout',{});resetOwnerView();token='';sessionStorage.removeItem('modax-token');$('app').hidden=true;$('auth').hidden=false;});
$('new-chat').onclick=safe(async()=>{if(controller) throw new Error('أوقف الرد الجاري أولاً');chatId=null;currentChat=null;$('messages').replaceChildren();$('chat-title').textContent='محادثة جديدة';});
$('search').oninput=safe(history);
$('chat-form').onsubmit=safe(async e=>{
  e.preventDefault();const epoch=sessionEpoch;const content=$('prompt').value.trim();if(!content||controller)return;
  if(!chatId){const chat=await (await post('/chats',{title:content.slice(0,80)})).json();chatId=chat.id;$('chat-title').textContent=chat.title;$('messages').replaceChildren();await history();}
  message('user',content);const assistant=message('assistant','','جارٍ التوليد');$('prompt').value='';
  controller=new AbortController();$('stop').hidden=false;$('send').disabled=true;
  try{
    const response=await api('/chats/'+chatId+'/messages',{method:'POST',body:JSON.stringify({content,model:$('model').value,attachment_ids:$('chat-attachment').value?[$('chat-attachment').value]:[]}),signal:controller.signal});
    const reader=response.body.getReader(),decoder=new TextDecoder();const streamController=response.modaxController;reader.closed.finally(()=>requests.delete(streamController)).catch(()=>{});let buffer='';
    while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});
      let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const eventName=block.split('\n').find(x=>x.startsWith('event: '))?.slice(7);const line=block.split('\n').find(x=>x.startsWith('data: '));if(!line)continue;const data=JSON.parse(line.slice(6));if(eventName==='delta')assistant.body.textContent+=data.text;if(eventName==='done'){assistant.label.textContent='MODAX · completed';renderMarkdown(assistant.body,assistant.body.textContent);}if(eventName==='error')throw new Error(data.message);$('messages').scrollTop=$('messages').scrollHeight;}
    }
  }catch(error){assistant.label.textContent=error.name==='AbortError'?'MODAX · interrupted':'MODAX · failed';if(error.name!=='AbortError')notify(error.message,true);}
  finally{if(epoch!==sessionEpoch)return;controller=null;$('stop').hidden=true;$('send').disabled=false;currentChat=await (await api('/chats/'+chatId)).json();}
});
$('stop').onclick=()=>controller?.abort();
async function download(response,filename){const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export-chat').onclick=safe(async()=>{if(!chatId)throw new Error('اختر محادثة أولاً');const chat=await (await api('/chats/'+chatId)).json();await download(new Response(JSON.stringify(chat,null,2)),'modax-chat.json');});
async function runTask(kind,goal,seed=42){
  const epoch=sessionEpoch;const resultId=kind==='code'?'coder-result':'game-result';$(resultId).replaceChildren();notify('المهمة قيد التنفيذ…');
  const task=await (await post('/tasks',{goal,kind,mode:kind==='code'?$('code-mode').value:'FAST'})).json();
  const panel=document.createElement('div');panel.className='panel';const state=document.createElement('p');state.className='task-status';state.textContent='RUNNING · '+task.id;panel.append(state);$(resultId).append(panel);
  const cancel=document.createElement('button');cancel.className='secondary';cancel.textContent='إلغاء المهمة';cancel.onclick=safe(async()=>{await post('/tasks/'+task.id+'/cancel',{});notify('تم طلب الإلغاء');});panel.append(cancel);
  let final=await (await post('/tasks/'+task.id+'/start',{model:$('model').value,execute:kind==='code'&&$('execute-tests').checked,seed,confirm_external_reviews:$('review-confirm').checked})).json();
  for(let attempt=0;['RUNNING','VERIFYING'].includes(final.state)&&attempt<100;attempt++){
    await new Promise(resolve=>setTimeout(resolve,3000));
    if(epoch!==sessionEpoch)return;
    final=await (await api('/tasks/'+task.id)).json();state.textContent=final.state+' · '+task.id;
  }
  if(epoch!==sessionEpoch)return;cancel.remove();state.textContent=final.state+' · '+task.id;const pre=document.createElement('pre');pre.textContent=JSON.stringify(final.result?JSON.parse(final.result):{},null,2);panel.append(pre);
  const button=document.createElement('button');button.textContent='تنزيل ملفات المشروع';button.onclick=safe(async()=>download(await api('/tasks/'+task.id+'/download'),'modax-project.zip'));panel.append(button);
  await taskHistory();notify(final.state==='COMPLETED'?'اكتملت الخطوات المحددة؛ راجع سجل التحقق.':'راجع سجل المهام لعرض الحالة والملفات.',final.state!=='COMPLETED');
}
async function taskHistory(){
  const records=await (await api('/tasks')).json();$('task-history').replaceChildren();
  for(const task of records){
    const panel=document.createElement('div');panel.className='panel';
    const label=document.createElement('p');label.textContent=task.state+' · '+task.goal;panel.append(label);
    const details=document.createElement('pre');details.textContent=task.result?JSON.stringify(JSON.parse(task.result),null,2):'لم تُسجل نتيجة بعد';panel.append(details);
    const downloadButton=document.createElement('button');downloadButton.textContent='تنزيل الملفات';downloadButton.onclick=safe(async()=>download(await api('/tasks/'+task.id+'/download'),'modax-project.zip'));panel.append(downloadButton);
    if(['RUNNING','VERIFYING','READY'].includes(task.state)){const cancel=document.createElement('button');cancel.textContent='إلغاء';cancel.onclick=safe(async()=>{await post('/tasks/'+task.id+'/cancel',{});await taskHistory();});panel.append(cancel);}
    if(['FAILED','BLOCKED'].includes(task.state)){const resume=document.createElement('button');resume.textContent='تجهيز لإعادة المحاولة';resume.onclick=safe(async()=>{await post('/tasks/'+task.id+'/resume',{});await taskHistory();});panel.append(resume);}
    if(task.state==='READY'){const run=document.createElement('button');run.textContent='تشغيل المهمة';run.onclick=safe(async()=>{await post('/tasks/'+task.id+'/start',{model:$('model').value,seed:task.result?(JSON.parse(task.result).seed??42):42,confirm_external_reviews:$('review-confirm').checked});await taskHistory();});panel.append(run);}
    $('task-history').append(panel);
  }
}
$('refresh-tasks').onclick=safe(taskHistory);
$('coder-form').onsubmit=safe(async e=>{e.preventDefault();await runTask('code',$('code-goal').value);});
$('game-form').onsubmit=safe(async e=>{e.preventDefault();await runTask('game',$('game-title').value,Number($('seed').value));});
async function memory(){const items=await (await api('/memory')).json();$('memory-list').replaceChildren();for(const item of items){const panel=document.createElement('div');panel.className='panel';const text=document.createElement('p');text.textContent=item.content;const button=document.createElement('button');button.className='secondary';button.textContent='حذف';button.onclick=safe(async()=>{await api('/memory/'+item.id,{method:'DELETE'});await memory();});panel.append(text,button);$('memory-list').append(panel);}}
$('memory-form').onsubmit=safe(async e=>{e.preventDefault();await post('/memory',{content:$('memory-text').value});$('memory-text').value='';await memory();});
async function usage(){const data=await (await api('/usage')).json();const table=document.createElement('table');const tr=document.createElement('tr');for(const text of ['النموذج','المدة ms','التكلفة']){const th=document.createElement('th');th.textContent=text;tr.append(th);}table.append(tr);for(const r of data.records){const row=document.createElement('tr');for(const value of [r.model,Math.round(r.latency_ms),r.cost??'غير متاح']){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}table.append(row);}$('usage-list').replaceChildren(table);}
for(const button of document.querySelectorAll('[data-view]'))button.onclick=safe(async()=>{const view=button.dataset.view;for(const panel of document.querySelectorAll('.view'))panel.hidden=panel.id!=='view-'+view;for(const nav of document.querySelectorAll('.nav'))nav.classList.toggle('active',nav===button);$('view-title').textContent=titleMap[view];notify('');if(view==='memory')await memory();if(view==='usage')await usage();if(view==='files')await documents();if(view==='arena')await arenaHistory();if(view==='tasks')await taskHistory();if(view==='settings')await settings();});
$('language').onclick=()=>{const rtl=document.documentElement.dir==='rtl';document.documentElement.dir=rtl?'ltr':'rtl';document.documentElement.lang='ar';};


function renderMarkdown(container,text){
  container.classList.add('markdown');container.replaceChildren();
  const parts=text.split(/(```[\s\S]*?```)/g);
  for(const part of parts){
    if(part.startsWith('```')){const content=part.slice(3,-3);const newline=content.indexOf('\n');const language=newline>=0?content.slice(0,newline).trim():'';const source=newline>=0?content.slice(newline+1):content;const pre=document.createElement('pre');const code=document.createElement('code');code.textContent=source;pre.append(code);const copy=document.createElement('button');copy.className='secondary compact';copy.textContent='نسخ '+language;copy.onclick=safe(async()=>{await navigator.clipboard.writeText(source);notify('تم نسخ الكود');});container.append(copy,pre);}
    else{for(const line of part.split('\n')){const heading=line.match(/^(#{1,3}) (.*)$/);const el=document.createElement(heading?'h'+(heading[1].length+2):'div');const value=heading?heading[2]:line;for(const segment of value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)){const node=document.createElement(segment.startsWith('**')?'strong':segment.startsWith('`')?'code':'span');node.textContent=segment.startsWith('**')?segment.slice(2,-2):segment.startsWith('`')?segment.slice(1,-1):segment;el.append(node);}container.append(el);}}
  }
}
$('import-chat').onclick=()=>$('chat-import-file').click();
$('chat-import-file').onchange=safe(async()=>{const file=$('chat-import-file').files[0];if(!file)return;if(file.size>200000)throw Error('Import is too large');const data=JSON.parse(await file.text());const chat=await(await post('/chats/import',{title:data.title||'Imported chat',messages:(data.messages||[]).map(m=>({role:m.role,content:m.content}))})).json();await openChat(chat.id);$('chat-import-file').value='';});
async function documents(){const records=await(await api('/files')).json();$('file-list').replaceChildren();$('chat-attachment').replaceChildren();const none=document.createElement('option');none.value='';none.textContent='بدون مستند';$('chat-attachment').append(none);for(const file of records){const option=document.createElement('option');option.value=file.id;option.textContent=file.filename;$('chat-attachment').append(option);const panel=document.createElement('div');panel.className='panel';const name=document.createElement('strong');name.textContent=file.filename;const preview=document.createElement('button');preview.className='secondary';preview.textContent='عرض النص';preview.onclick=safe(async()=>{const doc=await(await api('/files/'+file.id)).json();const text=document.createElement('pre');text.textContent=doc.content;panel.append(text);preview.disabled=true;});const remove=document.createElement('button');remove.className='secondary';remove.textContent='حذف';remove.onclick=safe(async()=>{await api('/files/'+file.id,{method:'DELETE'});await documents();});panel.append(name,preview,remove);$('file-list').append(panel);}}
$('file-form').onsubmit=safe(async event=>{event.preventDefault();const file=$('document-file').files[0];if(file.size>200000)throw Error('حد الملف 200 KB');const data=new FormData();data.append('file',file);await api('/files',{method:'POST',body:data});$('document-file').value='';await documents();notify('تم استخراج المستند وحفظ مقاطعه');});
$('file-search-form').onsubmit=safe(async event=>{event.preventDefault();const hits=await(await api('/files/search?q='+encodeURIComponent($('file-search').value))).json();$('file-hits').replaceChildren();for(const hit of hits){const pre=document.createElement('pre');pre.textContent=hit.filename+' / '+hit.ordinal+'\n'+hit.content;$('file-hits').append(pre);}});
async function settings(){const records=await(await api('/providers')).json();$('provider-list').replaceChildren();for(const item of records){const panel=document.createElement('div');panel.className='panel';const name=document.createElement('p');name.textContent=item.family+' / '+item.model;const remove=document.createElement('button');remove.className='secondary';remove.textContent='إزالة الاتصال';remove.onclick=safe(async()=>{await api('/providers/'+item.id,{method:'DELETE'});await settings();await enter();});panel.append(name,remove);$('provider-list').append(panel);}const prefs=await(await api('/settings')).json();$('use-memory').checked=prefs.use_memory;$('daily-requests').value=prefs.requests_per_day;}
$('provider-family').onchange=()=>{$('provider-url').value=$('provider-family').value==='anthropic'?'https://api.anthropic.com/v1':'https://api.openai.com/v1';};
$('provider-form').onsubmit=safe(async event=>{event.preventDefault();await post('/providers',{family:$('provider-family').value,model:$('provider-model').value,api_key:$('provider-key').value,base_url:$('provider-url').value});$('provider-key').value='';await settings();await enter();notify('حُفظ المفتاح مشفراً. اختَر النموذج في المحادثة.');});
$('preferences-form').onsubmit=safe(async event=>{event.preventDefault();await api('/settings',{method:'PUT',body:JSON.stringify({use_memory:$('use-memory').checked,requests_per_day:Number($('daily-requests').value)})});notify('حُفظت التفضيلات');});
async function arenaHistory(){const runs=await(await api('/arena/runs')).json();$('arena-results').replaceChildren();for(const run of runs){const panel=document.createElement('div');panel.className='panel';const pre=document.createElement('pre');pre.textContent=JSON.stringify(run,null,2);panel.append(pre);$('arena-results').append(panel);}}
$('arena-form').onsubmit=safe(async event=>{event.preventDefault();notify('التقييم قيد التنفيذ…');await post('/arena/runs',{models:Array.from($('arena-models').selectedOptions).map(o=>o.value),confirm_external_calls:$('arena-confirm').checked,template:$('arena-template').value});await arenaHistory();notify('نتائج محسوبة من الردود الفعلية');});

if(token)enter().catch(error=>{notify(error.message,true);});
