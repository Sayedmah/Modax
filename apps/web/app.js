'use strict';
const $ = id => document.getElementById(id);
let token = sessionStorage.getItem('modax-token') || '';
let chatId = null, currentChat = null, controller = null, sessionEpoch = 0;
let guestMode = false;
let fileEpoch = 0;
let arenaDatasetEpoch = 0;
let workspaceMode = 'M', historyEpoch = 0, researchEpoch = 0;
let chatSubmitting = false;
let chatViewEpoch = 0;
const requests = new Set();
function resetOwnerView() {
  $('quick-start').hidden=false;
  $('html-goal').value='';$('html-model').replaceChildren();$('html-result').replaceChildren();$('html-submit').disabled=false;
  chatViewEpoch++;
  chatSubmitting=false;$('mode-m').disabled=false;$('mode-x').disabled=false;
  historyEpoch++;researchEpoch++;workspaceMode='M';$('chat-web').checked=false;$('web-consent').checked=false;$('web-query').value='';$('web-results').replaceChildren();$('web-status').textContent='';$('web-search-submit').disabled=false;
  fileEpoch++;
  arenaDatasetEpoch++;$('dataset-name').value='';$('dataset-cases').value='[{"id":"greeting","task":"Return only MODAX","expected":"MODAX","match":"exact"}]';$('arena-dataset').replaceChildren();$('dataset-export').disabled=true;$('dataset-delete').disabled=true;
  $('account-import-file').value='';
  $('notes-import-file').value='';$('confirm-note-restore').checked=false;$('restore-notes').disabled=true;
  sessionEpoch++; controller?.abort(); controller=null;
  for(const request of requests) request.abort(); requests.clear();
  chatId=null; currentChat=null;
  for(const id of ['messages','chat-list','coder-result','game-result','memory-list','usage-list','model','file-list','file-hits','arena-results','provider-list','arena-models','task-history']) $(id).replaceChildren();
  for(const id of ['prompt','code-goal','memory-text','search','provider-key','provider-model','file-search']) $(id).value='';
  $('execute-tests').checked=false;$('code-project').value='';$('review-confirm').checked=false;$('code-mode').value='FAST';$('document-file').value='';$('chat-import-file').value='';$('chat-attachment').replaceChildren();$('use-memory').checked=false;$('daily-requests').value='100';$('arena-confirm').checked=false;$('arena-template').value='{task}'; $('stop').hidden=true; $('send').disabled=false;
  $('chat-title').textContent='مساحة للتفكير والبناء'; notify('');
  for(const panel of document.querySelectorAll('.view')) panel.hidden=panel.id!=='view-chat';
  for(const nav of document.querySelectorAll('.nav')) nav.classList.toggle('active',nav.dataset.view==='chat');
  $('view-title').textContent='المحادثة';
}
const titleMap = {chat:'المحادثة',coder:'Coder',html:'إنشاء ملف HTML',game:'Game Forge',memory:'الذاكرة',usage:'الاستخدام',files:'الملفات',arena:'Model Arena',settings:'الإعدادات',tasks:'سجل المهام',research:'بحث الإنترنت',about:'القدرات والذاكرة'};
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
    const failure=new Error(detail);failure.status=response.status;if(guestMode&&response.status===401){$('auth').hidden=true;$('boot-state').hidden=false;$('boot-message').textContent='انتهت الجلسة. افتح جلسة جديدة للمتابعة.';}throw failure;
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
  $('quick-start').hidden=true;
  const box=document.createElement('article');box.className='message '+role;
  const label=document.createElement('small');label.textContent=(role==='user'?'أنت':'MODAX')+(status?' · '+status:'');
  const identity=document.createElement('span');identity.className='model-badge';identity.hidden=role!=='assistant';identity.textContent='جارٍ تحديد النموذج…';
  const body=document.createElement(role==='assistant'?'div':'pre');body.textContent=content;box.append(label,identity,body);$('messages').append(box);
  if(role==='assistant'){
    const copy=document.createElement('button');copy.type='button';copy.className='copy-answer secondary';copy.textContent='نسخ الرد';
    copy.onclick=safe(async()=>{await navigator.clipboard.writeText(body.textContent);notify('نُسخ الرد');});box.append(copy);
  }
  $('messages').scrollTop=$('messages').scrollHeight;
  return {box,body,label,identity};
}
function showModel(target,data){
  const name=data.reported_model||data.configured_model||data.model;
  const legacy=['demo','gemini','openrouter','compatible','ollama','anthropic'].includes(name);
  target.textContent=!name?'النموذج غير مسجل':legacy?(name==='demo'?'DEMO · محاكاة':name+' · اسم النموذج التاريخي غير محفوظ'):name;
  if(name==='openrouter/free'||name==='auto')target.textContent+=' · موجّه؛ النموذج النهائي غير مُعلن';
  if(data.demo&&!target.textContent.includes('محاكاة'))target.textContent+=' · محاكاة';
  if(data.provider&&!data.demo)target.textContent=data.provider+' · '+target.textContent;
  target.dir='auto';
}
async function history() {
  const epoch=++historyEpoch;
  const chats=await (await api('/chats?q='+encodeURIComponent($('search').value)+'&workspace_mode='+workspaceMode)).json();
  if(epoch!==historyEpoch)return;
  $('chat-list').replaceChildren();
  for(const chat of chats) { const button=document.createElement('button');button.className='history-item'+(chat.id===chatId?' selected':'');button.textContent=chat.title;button.onclick=safe(()=>openChat(chat.id));$('chat-list').append(button); }
}
async function openChat(id) {
  if(controller||chatSubmitting) throw new Error('أوقف الرد الجاري قبل تغيير المحادثة');
  const epoch=++chatViewEpoch;const fetched=await (await api('/chats/'+id)).json();if(epoch!==chatViewEpoch)return;
  currentChat=fetched;chatId=id;$('chat-title').textContent=currentChat.title;$('messages').replaceChildren();
  workspaceMode=currentChat.workspace_mode||'M';modePresentation();
  $('quick-start').hidden=currentChat.messages.length>0;
  for(const m of currentChat.messages){const rendered=message(m.role,m.content,m.status);if(m.role==='assistant'){showModel(rendered.identity,{model:m.model});renderMarkdown(rendered.body,m.content);}}
  await history();
}
async function enter() {
  $('auth').hidden=true;
  modePresentation();
  const capabilities=await(await api('/workspace/capabilities')).json();$('chat-web').disabled=!capabilities.web_search;$('chat-web').checked=false;$('search-availability').textContent=capabilities.web_search?'خدمة البحث مُهيأة؛ يُفحص الاتصال عند الطلب. لن يُرسل سجل المحادثة إلى البحث.':'بحث الويب غير متصل حالياً؛ يحتاج تهيئة خادم SearXNG.';
  const models=await (await api('/models')).json();$('model').replaceChildren();$('arena-models').replaceChildren();
  const auto=document.createElement('option');auto.value='auto';auto.textContent='AUTO';$('model').append(auto);
  for(const m of models){const o=document.createElement('option');o.value=m.id;o.textContent=m.demo?'DEMO / محاكى':m.model;$('model').append(o);$('arena-models').append(o.cloneNode(true));}
  $('html-model').replaceChildren(...Array.from($('model').options).map(option=>option.cloneNode(true)));
  $('model').onchange=()=>{$('demo-banner').hidden=!models.some(m=>m.demo&&(m.id===$('model').value||($('model').value==='auto'&&!models.some(x=>!x.demo))));};$('model').onchange();
  await history();await documents();const health=await(await api('/health')).json();if(health.persistence==='local')notify('تنبيه: حفظ البيانات السحابي الدائم ينتظر ربط PostgreSQL؛ صدّر المحادثات المهمة قبل إعادة تشغيل الخدمة.');$('app').hidden=false;
}
async function authenticate(register=false) {
  $('auth-error').textContent='';
  try {const data=await (await post('/auth/'+(register?'register':'login'),{username:$('username').value,password:$('password').value})).json();resetOwnerView();token=data.token;sessionStorage.setItem('modax-token',token);$('password').value='';await enter();}
  catch(error){$('auth-error').textContent=error.message;}
}
$('auth-form').onsubmit=e=>{e.preventDefault();authenticate();};$('register').onclick=()=>authenticate(true);
$('logout').onclick=safe(async()=>{await post('/auth/logout',{});resetOwnerView();token='';sessionStorage.removeItem('modax-token');$('app').hidden=true;if(guestMode)await bootstrap();else $('auth').hidden=false;});
$('new-chat').onclick=safe(async()=>{if(controller||chatSubmitting) throw new Error('أوقف الرد الجاري أولاً');chatViewEpoch++;chatId=null;currentChat=null;$('messages').replaceChildren();$('quick-start').hidden=false;$('chat-title').textContent='محادثة جديدة';$('prompt').focus();});
$('search').oninput=safe(history);
$('chat-form').onsubmit=safe(async e=>{
  e.preventDefault();const epoch=sessionEpoch;const content=$('prompt').value.trim();if(!content||controller||chatSubmitting)return;
  if($('chat-web').checked&&content.length>240)throw Error('اكتب بحثاً لا يتجاوز 240 حرفاً، أو ألغِ بحث الويب.');
  chatSubmitting=true;$('mode-m').disabled=true;$('mode-x').disabled=true;
  try{
  if(!chatId){const chat=await (await post('/chats',{title:content.slice(0,80),workspace_mode:workspaceMode})).json();chatId=chat.id;$('chat-title').textContent=chat.title;$('messages').replaceChildren();await history();}
  message('user',content);const assistant=message('assistant','','جارٍ التوليد');$('prompt').value='';
  controller=new AbortController();$('stop').hidden=false;$('send').disabled=true;
  try{
    const web=$('chat-web').checked;$('chat-web').checked=false;
    const response=await api('/chats/'+chatId+'/messages',{method:'POST',body:JSON.stringify({content,model:$('model').value,attachment_ids:$('chat-attachment').value?[$('chat-attachment').value]:[],web_query:web?content:'',confirm_external_search:web}),signal:controller.signal});
    const reader=response.body.getReader(),decoder=new TextDecoder();const streamController=response.modaxController;reader.closed.finally(()=>requests.delete(streamController)).catch(()=>{});let buffer='';
    while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});
      let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const eventName=block.split('\n').find(x=>x.startsWith('event: '))?.slice(7);const line=block.split('\n').find(x=>x.startsWith('data: '));if(!line)continue;const data=JSON.parse(line.slice(6));if(eventName==='start'||eventName==='done')showModel(assistant.identity,data);if(eventName==='delta')assistant.body.textContent+=data.text;if(eventName==='done'){assistant.label.textContent='MODAX · completed';renderMarkdown(assistant.body,assistant.body.textContent);}if(eventName==='error')throw new Error(data.message);$('messages').scrollTop=$('messages').scrollHeight;}
    }
  }catch(error){assistant.label.textContent=error.name==='AbortError'?'MODAX · interrupted':'MODAX · failed';if(error.name!=='AbortError')notify(error.message,true);}
  finally{if(epoch!==sessionEpoch)return;controller=null;$('stop').hidden=true;$('send').disabled=false;currentChat=await (await api('/chats/'+chatId)).json();}
  }finally{if(epoch===sessionEpoch){chatSubmitting=false;$('mode-m').disabled=false;$('mode-x').disabled=false;}}
});
$('stop').onclick=()=>controller?.abort();
async function download(response,filename){const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export-chat').onclick=safe(async()=>{if(!chatId)throw new Error('اختر محادثة أولاً');const chat=await (await api('/chats/'+chatId)).json();await download(new Response(JSON.stringify(chat,null,2)),'modax-chat.json');});
async function runTask(kind,goal,seed=42){
  const epoch=sessionEpoch;const resultId=kind==='code'?'coder-result':kind==='html'?'html-result':'game-result';$(resultId).replaceChildren();notify('المهمة قيد التنفيذ…');
  const task=await (await post('/tasks',{goal,kind,mode:kind==='code'?$('code-mode').value:'FAST'})).json();
  if(kind==='code'&&$('code-project').files.length){const body=new FormData();body.append('file',$('code-project').files[0]);await (await api('/tasks/'+task.id+'/project',{method:'POST',body})).json();}
  const panel=document.createElement('div');panel.className='panel';const state=document.createElement('p');state.className='task-status';state.textContent='RUNNING · '+task.id;panel.append(state);$(resultId).append(panel);
  const cancel=document.createElement('button');cancel.className='secondary';cancel.textContent='إلغاء المهمة';cancel.onclick=safe(async()=>{await post('/tasks/'+task.id+'/cancel',{});notify('تم طلب الإلغاء');});panel.append(cancel);
  let final=await (await post('/tasks/'+task.id+'/start',{model:kind==='html'?$('html-model').value:$('model').value,execute:kind==='code'&&$('execute-tests').checked,seed,confirm_external_reviews:$('review-confirm').checked})).json();
  for(let attempt=0;['RUNNING','VERIFYING'].includes(final.state)&&attempt<100;attempt++){
    await new Promise(resolve=>setTimeout(resolve,3000));
    if(epoch!==sessionEpoch)return;
    final=await (await api('/tasks/'+task.id)).json();state.textContent=final.state+' · '+task.id;
  }
  if(epoch!==sessionEpoch)return;cancel.remove();state.textContent=final.state+' · '+task.id;const pre=document.createElement('pre');pre.textContent=JSON.stringify(final.result?JSON.parse(final.result):{},null,2);panel.append(pre);
  const button=document.createElement('button');button.textContent='تنزيل ملفات المشروع';button.onclick=safe(async()=>download(await api('/tasks/'+task.id+'/download'),'modax-project.zip'));panel.append(button);if(kind==='code'){const patch=document.createElement('button');patch.className='patch-download';patch.textContent='تنزيل التغييرات .patch';patch.onclick=safe(async()=>download(await api('/tasks/'+task.id+'/patch'),'modax-change.patch'));panel.append(patch);}
  if(kind==='html'&&final.state==='COMPLETED')htmlDownloadButton(panel,task.id);
  await taskHistory();notify(final.state==='COMPLETED'?'اكتملت الخطوات المحددة؛ راجع سجل التحقق.':'راجع سجل المهام لعرض الحالة والملفات.',final.state!=='COMPLETED');
}
async function taskHistory(){
  const records=await (await api('/tasks')).json();$('task-history').replaceChildren();
  for(const task of records){
    const panel=document.createElement('div');panel.className='panel';
    if(task.kind==='html'&&task.state==='COMPLETED')htmlDownloadButton(panel,task.id);
    const label=document.createElement('p');label.textContent=task.state+' · '+task.goal;panel.append(label);
    const details=document.createElement('pre');details.textContent=task.result?JSON.stringify(JSON.parse(task.result),null,2):'لم تُسجل نتيجة بعد';panel.append(details);
    const downloadButton=document.createElement('button');downloadButton.textContent='تنزيل الملفات';downloadButton.onclick=safe(async()=>download(await api('/tasks/'+task.id+'/download'),'modax-project.zip'));panel.append(downloadButton);if(task.kind==='code'&&task.result&&JSON.parse(task.result).snapshot){const patch=document.createElement('button');patch.textContent='تنزيل التغييرات .patch';patch.onclick=safe(async()=>download(await api('/tasks/'+task.id+'/patch'),'modax-change.patch'));panel.append(patch);}
    if(['RUNNING','VERIFYING','READY'].includes(task.state)){const cancel=document.createElement('button');cancel.textContent='إلغاء';cancel.onclick=safe(async()=>{await post('/tasks/'+task.id+'/cancel',{});await taskHistory();});panel.append(cancel);}
    if(['FAILED','BLOCKED'].includes(task.state)){const resume=document.createElement('button');resume.textContent='تجهيز لإعادة المحاولة';resume.onclick=safe(async()=>{await post('/tasks/'+task.id+'/resume',{});await taskHistory();});panel.append(resume);}
    if(task.state==='READY'){const run=document.createElement('button');run.textContent='تشغيل المهمة';run.onclick=safe(async()=>{await post('/tasks/'+task.id+'/start',{model:$('model').value,seed:task.result?(JSON.parse(task.result).seed??42):42,confirm_external_reviews:$('review-confirm').checked});await taskHistory();});panel.append(run);}
    $('task-history').append(panel);
  }
}
$('refresh-tasks').onclick=safe(taskHistory);
$('coder-form').onsubmit=safe(async e=>{e.preventDefault();await runTask('code',$('code-goal').value);});
$('html-form').onsubmit=safe(async e=>{e.preventDefault();const epoch=sessionEpoch;$('html-submit').disabled=true;try{await runTask('html',$('html-goal').value);}finally{if(epoch===sessionEpoch)$('html-submit').disabled=false;}});
function htmlDownloadButton(panel,id){const button=document.createElement('button');button.className='html-download';button.textContent='تنزيل index.html';button.onclick=safe(async()=>download(await api('/tasks/'+id+'/html'),'index.html'));panel.append(button);}
$('game-form').onsubmit=safe(async e=>{e.preventDefault();await runTask('game',$('game-title').value,Number($('seed').value));});
async function memory(){const items=await (await api('/memory')).json();$('memory-list').replaceChildren();for(const item of items){const panel=document.createElement('div');panel.className='panel';const text=document.createElement('p');text.textContent=item.content;const button=document.createElement('button');button.className='secondary';button.textContent='حذف';button.onclick=safe(async()=>{await api('/memory/'+item.id,{method:'DELETE'});await memory();});panel.append(text,button);$('memory-list').append(panel);}}
$('memory-form').onsubmit=safe(async e=>{e.preventDefault();await post('/memory',{content:$('memory-text').value});$('memory-text').value='';await memory();});
async function usage(){const data=await (await api('/usage')).json();const table=document.createElement('table');const tr=document.createElement('tr');for(const text of ['النموذج','المدة ms','رموز الإدخال','رموز الإخراج','التكلفة']){const th=document.createElement('th');th.textContent=text;tr.append(th);}table.append(tr);for(const r of data.records){const row=document.createElement('tr');for(const value of [r.model,Math.round(r.latency_ms),r.input_tokens??'غير متاح',r.output_tokens??'غير متاح',r.cost??'غير متاح']){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}table.append(row);}$('usage-list').replaceChildren(table);}
for(const button of document.querySelectorAll('[data-view]'))button.onclick=safe(async()=>{const view=button.dataset.view;for(const panel of document.querySelectorAll('.view'))panel.hidden=panel.id!=='view-'+view;for(const nav of document.querySelectorAll('.nav'))nav.classList.toggle('active',nav.dataset.view===view);$('view-title').textContent=titleMap[view];notify('');if(view==='memory')await memory();if(view==='usage')await usage();if(view==='files')await documents();if(view==='arena')await arenaHistory();if(view==='tasks')await taskHistory();if(view==='settings')await settings();});
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
$('chat-import-file').onchange=safe(async()=>{const file=$('chat-import-file').files[0];if(!file)return;if(file.size>200000)throw Error('Import is too large');const data=JSON.parse(await file.text());const chat=await(await post('/chats/import',{title:data.title||'Imported chat',workspace_mode:data.workspace_mode||workspaceMode,messages:(data.messages||[]).map(m=>({role:m.role,content:m.content}))})).json();await openChat(chat.id);$('chat-import-file').value='';});
async function documents(){
  const epoch=++fileEpoch,selected=$('chat-attachment').value;
  const records=await(await api('/files')).json();if(epoch!==fileEpoch)return;
  $('file-list').replaceChildren();$('chat-attachment').replaceChildren();
  const none=document.createElement('option');none.value='';none.textContent='بدون مستند';$('chat-attachment').append(none);
  for(const file of records){
    const option=document.createElement('option');option.value=file.id;option.textContent=file.filename;$('chat-attachment').append(option);
    const panel=document.createElement('div');panel.className='panel';panel.dataset.fileId=file.id;
    const name=document.createElement('strong');name.textContent=file.filename;
    const preview=document.createElement('button');preview.className='secondary';preview.textContent='عرض النص';
    preview.onclick=safe(async()=>{const current=fileEpoch;const doc=await(await api('/files/'+file.id)).json();if(current!==fileEpoch)return;const text=document.createElement('pre');text.textContent=doc.content;panel.append(text);preview.disabled=true;});
    const remove=document.createElement('button');remove.className='secondary file-delete';remove.textContent='حذف المستند';remove.setAttribute('aria-label','حذف المستند '+file.filename);
    remove.onclick=safe(async()=>{
      if(controller)throw Error('أوقف الرد الجاري قبل حذف المستند');
      if(!window.confirm('حذف «'+file.filename+'» نهائيًا مع مقاطع البحث؟ لن تُمحى المحادثات السابقة أو البيانات التي أُرسلت إلى نموذج.'))return;
      remove.disabled=true;fileEpoch++;
      try{await api('/files/'+file.id,{method:'DELETE'});fileEpoch++;$('file-hits').replaceChildren();await documents();notify('حُذف المستند ومقاطع البحث. المحادثات السابقة لم تتغير.');}
      finally{remove.disabled=false;}
    });
    panel.append(name,preview,remove);$('file-list').append(panel);
  }
  if(records.some(file=>file.id===selected))$('chat-attachment').value=selected;
}
$('file-form').onsubmit=safe(async event=>{event.preventDefault();const file=$('document-file').files[0];if(file.size>200000)throw Error('حد الملف 200 KB');const data=new FormData();data.append('file',file);await(await api('/files',{method:'POST',body:data})).json();$('document-file').value='';await documents();notify('تم استخراج المستند وحفظ مقاطعه');});
$('file-search-form').onsubmit=safe(async event=>{event.preventDefault();const epoch=fileEpoch;const hits=await(await api('/files/search?q='+encodeURIComponent($('file-search').value))).json();if(epoch!==fileEpoch)return;$('file-hits').replaceChildren();for(const hit of hits){const pre=document.createElement('pre');pre.textContent=hit.filename+' / '+hit.ordinal+'\n'+hit.content;$('file-hits').append(pre);}});
async function settings(){const records=await(await api('/providers')).json();$('provider-list').replaceChildren();for(const item of records){const panel=document.createElement('div');panel.className='panel';const name=document.createElement('p');name.textContent=item.family+' / '+item.model;const remove=document.createElement('button');remove.className='secondary';remove.textContent='إزالة الاتصال';remove.onclick=safe(async()=>{await api('/providers/'+item.id,{method:'DELETE'});await settings();await enter();});panel.append(name,remove);$('provider-list').append(panel);}const prefs=await(await api('/settings')).json();$('use-memory').checked=prefs.use_memory;$('daily-requests').value=prefs.requests_per_day;}
function syncProviderEndpoint(){const endpoints={gemini:'https://generativelanguage.googleapis.com/v1beta/openai',openrouter:'https://openrouter.ai/api/v1',anthropic:'https://api.anthropic.com/v1',compatible:'https://api.openai.com/v1'};const family=$('provider-family').value;$('provider-url').value=endpoints[family];$('provider-url').disabled=family!=='compatible';}
$('provider-family').onchange=syncProviderEndpoint;
syncProviderEndpoint();
$('provider-form').onsubmit=safe(async event=>{event.preventDefault();await post('/providers',{family:$('provider-family').value,model:$('provider-model').value,api_key:$('provider-key').value,base_url:$('provider-url').value});$('provider-key').value='';await settings();await enter();notify('حُفظ المفتاح مشفراً. اختَر النموذج في المحادثة.');});
$('preferences-form').onsubmit=safe(async event=>{event.preventDefault();await api('/settings',{method:'PUT',body:JSON.stringify({use_memory:$('use-memory').checked,requests_per_day:Number($('daily-requests').value)})});notify('حُفظت التفضيلات');});
$('account-export').onclick=safe(async()=>{
  const button=$('account-export');button.disabled=true;
  try{notify('تجهيز بياناتك للتنزيل…');await download(await api('/account/export'),'modax-account.zip');notify('نُزّل ملف خاص غير مشفر؛ احتفظ به بأمان.');}
  finally{button.disabled=false;}
});
async function arenaDatasets(preferred=null){
  const epoch=++arenaDatasetEpoch,selected=preferred??$('arena-dataset').value;
  const records=await(await api('/arena/datasets')).json();if(epoch!==arenaDatasetEpoch)return;
  $('arena-dataset').replaceChildren();const core=document.createElement('option');core.value='';core.textContent='core-v1 — الاختبارات الأساسية';$('arena-dataset').append(core);
  for(const record of records){const option=document.createElement('option');option.value=record.id;option.textContent=record.name+' · '+record.version.slice(0,12)+' · '+record.case_count+' أسئلة';$('arena-dataset').append(option);}
  if(records.some(record=>record.id===selected))$('arena-dataset').value=selected;
  syncDatasetControls();
}
function syncDatasetControls(){const chosen=!!$('arena-dataset').value;$('dataset-export').disabled=!chosen;$('dataset-delete').disabled=!chosen;}
$('arena-dataset').onchange=syncDatasetControls;
$('dataset-form').onsubmit=safe(async event=>{event.preventDefault();let cases;try{cases=JSON.parse($('dataset-cases').value);}catch{throw Error('مصفوفة JSON غير صالحة');}if(!Array.isArray(cases)||cases.length<1||cases.length>10)throw Error('اختر من 1 إلى 10 أسئلة');const button=$('dataset-save');button.disabled=true;try{const data=await(await post('/arena/datasets',{name:$('dataset-name').value,cases})).json();await arenaDatasets(data.id);notify('حُفظت نسخة ثابتة ببصمة محتوى؛ لا يُعد ذلك تدريبًا لنموذج.');}finally{button.disabled=false;}});
$('dataset-export').onclick=safe(async()=>{const id=$('arena-dataset').value;if(!id)return;await download(await api('/arena/datasets/'+id),'modax-arena-dataset.json');});
$('dataset-delete').onclick=safe(async()=>{const id=$('arena-dataset').value;if(!id||!window.confirm('حذف المجموعة؟ تبقى النتائج السابقة ونسخة الأسئلة محفوظة في سجل التقييم.'))return;arenaDatasetEpoch++;await api('/arena/datasets/'+id,{method:'DELETE'});await arenaDatasets('');notify('حُذفت المجموعة، ولم تتغير نتائج التقييم السابقة.');});
async function arenaHistory(){await arenaDatasets();const runs=await(await api('/arena/runs')).json();$('arena-results').replaceChildren();for(const run of runs){const panel=document.createElement('div');panel.className='panel';const pre=document.createElement('pre');pre.textContent=JSON.stringify(run,null,2);panel.append(pre);$('arena-results').append(panel);}}
$('restore-chats').onclick=()=>$('account-import-file').click();
$('confirm-note-restore').onchange=()=>{$('restore-notes').disabled=!$('confirm-note-restore').checked;};
$('restore-notes').onclick=()=>{if($('confirm-note-restore').checked)$('notes-import-file').click();};
$('notes-import-file').onchange=safe(async()=>{
  const input=$('notes-import-file'),file=input.files[0];if(!file)return;
  const button=$('restore-notes');button.disabled=true;$('confirm-note-restore').disabled=true;
  try{if(!$('confirm-note-restore').checked)throw Error('وافق صراحة على استعادة الملاحظات أولًا');
    if(controller)throw Error('أوقف الرد الجاري قبل استعادة الملاحظات');
    if(file.size>4*1024*1024)throw Error('حجم ZIP يتجاوز 4 MiB');
    const body=new FormData();body.append('file',file);body.append('confirm','true');notify('التحقق من الأرشيف واستعادة الملاحظات…');
    const result=await(await api('/account/import-notes',{method:'POST',body})).json();await memory();
    notify('تمت استعادة '+result.imported_notes+' ملاحظة. لم تتغير إعدادات استخدام الذاكرة؛ راجع الملاحظات أولًا.');
  }finally{input.value='';$('confirm-note-restore').disabled=false;$('confirm-note-restore').checked=false;button.disabled=true;}
});
$('account-import-file').onchange=safe(async()=>{
  const input=$('account-import-file'),file=input.files[0];if(!file)return;
  const button=$('restore-chats');button.disabled=true;
  try{if(controller)throw Error('أوقف الرد الجاري قبل استعادة المحادثات');if(file.size>4*1024*1024)throw Error('حجم ZIP يتجاوز 4 MiB');
    const body=new FormData();body.append('file',file);notify('التحقق من الأرشيف واستعادة المحادثات…');
    const result=await(await api('/account/import-chats',{method:'POST',body})).json();await history();
    if(result.chats.length&&!controller)await openChat(result.chats[0].id);
    notify('تمت استعادة '+result.chats.length+' محادثة و'+result.imported_messages+' رسالة.'+(result.interrupted_messages?' أُوقفت الردود التي كانت جارية في الأرشيف.':''));
  }finally{input.value='';button.disabled=false;}
});
$('arena-form').onsubmit=safe(async event=>{event.preventDefault();const button=$('arena-form').querySelector('button[type=submit]');button.disabled=true;try{notify('التقييم قيد التنفيذ…');await(await post('/arena/runs',{models:Array.from($('arena-models').selectedOptions).map(o=>o.value),confirm_external_calls:$('arena-confirm').checked,template:$('arena-template').value,dataset_id:$('arena-dataset').value||null})).json();await arenaHistory();notify('نتائج محسوبة من الردود الفعلية');}finally{button.disabled=false;}});

async function bootstrap(){
  if(typeof window!=='undefined'&&window.innerWidth<760)$('app').classList.add('sidebar-closed');
  $('boot-state').hidden=false;$('auth').hidden=true;$('boot-message').textContent='جاري فتح MODAX…';$('boot-retry').disabled=true;
  try{
    const health=await(await api('/health')).json();$('app-version').textContent='v'+health.version;guestMode=health.guest_mode===true;
    $('logout').textContent=guestMode?'جلسة جديدة':'تسجيل الخروج';
    if(token){try{await enter();return;}catch(error){if(error.status!==401)throw error;}}
    if(guestMode){const data=await(await post('/auth/guest',{})).json();resetOwnerView();token=data.token;sessionStorage.setItem('modax-token',token);await enter();}
    else $('auth').hidden=false;
  }catch(error){$('boot-message').textContent='تعذر فتح الموقع: '+error.message;$('boot-state').hidden=false;return;}
  finally{$('boot-retry').disabled=false;if(!$('app').hidden||!$('auth').hidden)$('boot-state').hidden=true;}
}
function modePresentation(){
  if(!chatId)$('quick-start').hidden=false;
  $('mode-name').textContent=workspaceMode==='M'?'M · دردشة خفيفة':'X · مساحة العمل';
  $('mode-description').textContent=workspaceMode==='M'?'أسئلة وإجابات وملفات وملاحظات خاصة بك.':'خطط، أنشئ الملفات، وراجع نتائج التحقق.';
  $('work-actions').hidden=workspaceMode!=='X';
  for(const mode of ['M','X']){const button=$('mode-'+mode.toLowerCase());button.setAttribute('aria-pressed',String(mode===workspaceMode));button.setAttribute('aria-expanded',String(!$('app').classList.contains('sidebar-closed')));}
}
async function chooseMode(mode){
  if(controller||chatSubmitting)throw Error('انتظر اكتمال الطلب أو أوقف الرد أولاً');
  if(mode===workspaceMode){$('app').classList.toggle('sidebar-closed');}
  else{chatViewEpoch++;workspaceMode=mode;historyEpoch++;chatId=null;currentChat=null;$('messages').replaceChildren();$('chat-title').textContent=mode==='M'?'محادثة خفيفة جديدة':'مشروعك التالي';$('search').value='';$('chat-web').checked=false;$('app').classList.remove('sidebar-closed');await history();}
  modePresentation();
  const expanded=!$('app').classList.contains('sidebar-closed');for(const id of ['mode-m','mode-x'])$(id).setAttribute('aria-expanded',String(expanded));
  for(const panel of document.querySelectorAll('.view'))panel.hidden=panel.id!=='view-chat';
  $('view-title').textContent=workspaceMode==='M'?'المحادثة':'X · مساحة العمل';
  for(const nav of document.querySelectorAll('.nav'))nav.classList.toggle('active',nav.dataset.view==='chat');
}
$('mode-m').onclick=safe(()=>chooseMode('M'));$('mode-x').onclick=safe(()=>chooseMode('X'));
$('work-code').onclick=safe(async()=>{const goal=$('prompt').value.trim();document.querySelector('[data-view="coder"]').click();if(goal)$('code-goal').value=goal;$('code-goal').focus();});
$('work-game').onclick=()=>document.querySelector('[data-view="game"]').click();
$('work-html').onclick=()=>{document.querySelector('[data-view="html"]').click();if($('prompt').value.trim())$('html-goal').value=$('prompt').value.trim();$('html-goal').focus();};
$('work-history').onclick=()=>document.querySelector('[data-view="tasks"]').click();
$('about-memory').onclick=()=>document.querySelector('[data-view="memory"]').click();
$('about-settings').onclick=()=>document.querySelector('.nav[data-view="settings"]').click();
$('web-search-form').onsubmit=safe(async event=>{
  event.preventDefault();const epoch=++researchEpoch;$('web-results').replaceChildren();$('web-status').textContent='جاري البحث…';$('web-search-submit').disabled=true;
  try{const data=await(await post('/research/search',{query:$('web-query').value,confirm_external_search:$('web-consent').checked})).json();if(epoch!==researchEpoch)return;
    $('web-status').textContent=data.results.length?'مقتطفات بحث — افتح المصادر للتحقق.':'لم يرجع المحرك نتائج.';
    for(const result of data.results){const panel=document.createElement('article');panel.className='panel';const link=document.createElement('a');link.href=result.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=result.title||result.url;const snippet=document.createElement('p');snippet.textContent=result.snippet;panel.append(link,snippet);$('web-results').append(panel);}
  }catch(error){if(epoch===researchEpoch)$('web-status').textContent=error.message;}
  finally{if(epoch===researchEpoch)$('web-search-submit').disabled=false;}
});
$('boot-retry').onclick=()=>bootstrap();
$('prompt').onkeydown=event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();$('chat-form').requestSubmit();}};
for(const button of document.querySelectorAll('[data-quick-view]'))button.onclick=()=>{document.querySelector('.nav[data-view="'+button.dataset.quickView+'"]').click();const field=$(button.dataset.quickField);field.value=button.dataset.quickPrompt;field.focus();if(innerWidth<=760){$('app').classList.add('sidebar-closed');for(const id of ['mode-m','mode-x'])$(id).setAttribute('aria-expanded','false');}};
if(typeof window!=='undefined')bootstrap();
