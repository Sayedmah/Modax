'use strict';
const $ = id => document.getElementById(id);
let token = sessionStorage.getItem('modax-token') || '';
let chatId = null, currentChat = null, controller = null, sessionEpoch = 0;
const requests = new Set();
function resetOwnerView() {
  sessionEpoch++; controller?.abort(); controller=null;
  for(const request of requests) request.abort(); requests.clear();
  chatId=null; currentChat=null;
  for(const id of ['messages','chat-list','coder-result','game-result','memory-list','usage-list','model']) $(id).replaceChildren();
  for(const id of ['prompt','code-goal','memory-text','search']) $(id).value='';
  $('execute-tests').checked=false; $('stop').hidden=true; $('send').disabled=false;
  $('chat-title').textContent='مساحة للتفكير والبناء'; notify('');
  for(const panel of document.querySelectorAll('.view')) panel.hidden=panel.id!=='view-chat';
  for(const nav of document.querySelectorAll('.nav')) nav.classList.toggle('active',nav.dataset.view==='chat');
  $('view-title').textContent='المحادثة';
}
const titleMap = {chat:'المحادثة',coder:'Coder',game:'Game Forge',memory:'الذاكرة',usage:'الاستخدام'};
function notify(text, error=false) { $('notice').textContent=text; $('notice').className=error?'error':''; }
async function api(path, options={}) {
  const epoch=sessionEpoch, requestController=new AbortController(); requests.add(requestController);
  const signal=options.signal?AbortSignal.any([options.signal,requestController.signal]):requestController.signal;
  let response; try { response = await fetch('/api/v1'+path,{...options,signal,headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,...options.headers}}); } finally { requests.delete(requestController); }
  if(epoch!==sessionEpoch) throw new Error('Session changed');
  if(!response.ok) {
    let detail='HTTP '+response.status;
    try { const data=await response.json(); detail=typeof data.detail==='string'?data.detail:JSON.stringify(data.detail); } catch {}
    if(response.status===401 && token) { resetOwnerView(); token=''; sessionStorage.removeItem('modax-token'); $('auth').hidden=false; $('app').hidden=true; }
    throw new Error(detail);
  }
  return response;
}
const post = async (path, data) => (await api(path,{method:'POST',body:JSON.stringify(data)}));
function safe(handler) { return async event => { try { await handler(event); } catch(error) { notify(error.message,true); } }; }
function message(role,content,status='') {
  const box=document.createElement('article');box.className='message '+role;
  const label=document.createElement('small');label.textContent=(role==='user'?'أنت':'MODAX')+(status?' · '+status:'');
  const body=document.createElement('pre');body.textContent=content;box.append(label,body);$('messages').append(box);
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
  const models=await (await api('/models')).json();$('model').replaceChildren();
  const auto=document.createElement('option');auto.value='auto';auto.textContent='AUTO';$('model').append(auto);
  for(const m of models){const o=document.createElement('option');o.value=m.id;o.textContent=m.demo?'DEMO / محاكى':m.model;$('model').append(o);}
  $('model').onchange=()=>{$('demo-banner').hidden=!models.some(m=>m.demo&&(m.id===$('model').value||($('model').value==='auto'&&!models.some(x=>!x.demo))));};$('model').onchange();
  await history();
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
    const response=await api('/chats/'+chatId+'/messages',{method:'POST',body:JSON.stringify({content,model:$('model').value}),signal:controller.signal});
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
    while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});
      let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const eventName=block.split('\n').find(x=>x.startsWith('event: '))?.slice(7);const line=block.split('\n').find(x=>x.startsWith('data: '));if(!line)continue;const data=JSON.parse(line.slice(6));if(eventName==='delta')assistant.body.textContent+=data.text;if(eventName==='done')assistant.label.textContent='MODAX · completed';if(eventName==='error')throw new Error(data.message);$('messages').scrollTop=$('messages').scrollHeight;}
    }
  }catch(error){assistant.label.textContent=error.name==='AbortError'?'MODAX · interrupted':'MODAX · failed';if(error.name!=='AbortError')notify(error.message,true);}
  finally{if(epoch!==sessionEpoch)return;controller=null;$('stop').hidden=true;$('send').disabled=false;currentChat=await (await api('/chats/'+chatId)).json();}
});
$('stop').onclick=()=>controller?.abort();
async function download(response,filename){const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export-chat').onclick=safe(async()=>{if(!chatId)throw new Error('اختر محادثة أولاً');const chat=await (await api('/chats/'+chatId)).json();await download(new Response(JSON.stringify(chat,null,2)),'modax-chat.json');});
async function runTask(kind,goal,seed=42){
  const epoch=sessionEpoch;const resultId=kind==='code'?'coder-result':'game-result';$(resultId).replaceChildren();notify('المهمة قيد التنفيذ…');
  const task=await (await post('/tasks',{goal,kind,mode:'SMART'})).json();
  const panel=document.createElement('div');panel.className='panel';const state=document.createElement('p');state.className='task-status';state.textContent='RUNNING · '+task.id;panel.append(state);$(resultId).append(panel);
  const cancel=document.createElement('button');cancel.className='secondary';cancel.textContent='إلغاء المهمة';cancel.onclick=safe(async()=>{await post('/tasks/'+task.id+'/cancel',{});notify('تم طلب الإلغاء');});panel.append(cancel);
  let final;try{final=await (await post('/tasks/'+task.id+'/run',{model:$('model').value,execute:kind==='code'&&$('execute-tests').checked,seed})).json();}catch(error){final=await (await api('/tasks/'+task.id)).json();notify(error.message,true);}
  if(epoch!==sessionEpoch)return;cancel.remove();state.textContent=final.state+' · '+task.id;const pre=document.createElement('pre');pre.textContent=JSON.stringify(final.result?JSON.parse(final.result):{},null,2);panel.append(pre);
  const button=document.createElement('button');button.textContent='تنزيل ملفات المشروع';button.onclick=safe(async()=>download(await api('/tasks/'+task.id+'/download'),'modax-project.zip'));panel.append(button);
  notify(final.state==='COMPLETED'?'اكتملت الخطوات المحددة؛ راجع سجل التحقق.':'الملفات محفوظة؛ راجع العائق المسجل.',final.state!=='COMPLETED');
}
$('coder-form').onsubmit=safe(async e=>{e.preventDefault();await runTask('code',$('code-goal').value);});
$('game-form').onsubmit=safe(async e=>{e.preventDefault();await runTask('game',$('game-title').value,Number($('seed').value));});
async function memory(){const items=await (await api('/memory')).json();$('memory-list').replaceChildren();for(const item of items){const panel=document.createElement('div');panel.className='panel';const text=document.createElement('p');text.textContent=item.content;const button=document.createElement('button');button.className='secondary';button.textContent='حذف';button.onclick=safe(async()=>{await api('/memory/'+item.id,{method:'DELETE'});await memory();});panel.append(text,button);$('memory-list').append(panel);}}
$('memory-form').onsubmit=safe(async e=>{e.preventDefault();await post('/memory',{content:$('memory-text').value});$('memory-text').value='';await memory();});
async function usage(){const data=await (await api('/usage')).json();const table=document.createElement('table');const tr=document.createElement('tr');for(const text of ['النموذج','المدة ms','التكلفة']){const th=document.createElement('th');th.textContent=text;tr.append(th);}table.append(tr);for(const r of data.records){const row=document.createElement('tr');for(const value of [r.model,Math.round(r.latency_ms),r.cost??'غير متاح']){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}table.append(row);}$('usage-list').replaceChildren(table);}
for(const button of document.querySelectorAll('[data-view]'))button.onclick=safe(async()=>{const view=button.dataset.view;for(const panel of document.querySelectorAll('.view'))panel.hidden=panel.id!=='view-'+view;for(const nav of document.querySelectorAll('.nav'))nav.classList.toggle('active',nav===button);$('view-title').textContent=titleMap[view];notify('');if(view==='memory')await memory();if(view==='usage')await usage();});
$('language').onclick=()=>{const rtl=document.documentElement.dir==='rtl';document.documentElement.dir=rtl?'ltr':'rtl';document.documentElement.lang='ar';};
if(token)enter().catch(error=>{notify(error.message,true);});
