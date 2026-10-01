import { ESPLoader, Transport } from 'https://unpkg.com/esptool-js@0.6.1/lib/index.js';
import { serial as webSerialPolyfill } from 'https://cdn.jsdelivr.net/npm/web-serial-polyfill@1.0.15/+esm';

const $ = (id) => document.getElementById(id);
const serialApi = navigator.serial || (navigator.usb ? webSerialPolyfill : null);
const FIRMWARE_URL = './firmware/modax-esp32-wroom32-full.bin';
const state = { port:null, transport:null, loader:null, chip:'', flashSize:'', firmware:null, stream:null };

function log(line='') { const el=$('terminal'); el.textContent += line + '\n'; el.scrollTop=el.scrollHeight; }
function status(text){ $('deviceState').textContent=text; }
function setProgress(p,text=''){ const v=Math.max(0,Math.min(100,p||0)); $('progressBar').style.width=v+'%'; $('progressText').textContent=text||v.toFixed(1)+'%'; }

function isClassicEsp32(){
  const c = String(state.chip || '').toUpperCase();
  if (!c.includes('ESP32')) return false;
  return !/ESP32[- ]?(S2|S3|C2|C3|C5|C6|C61|H2|P4)/i.test(c);
}
function updateBoardMatch(){
  if(!state.loader){ $('boardMatch').textContent='لم يتم الفحص'; return; }
  $('boardMatch').textContent = isClassicEsp32() ? 'مطابق لملف ESP32-WROOM-32' : 'غير مطابق — التفليش محظور';
}
function updateFlashButton(){ $('flashBtn').disabled = !(state.loader && state.firmware && isClassicEsp32()); }

async function loadFirmware(){
  state.firmware = null;
  updateFlashButton();
  $('firmwareStatus').textContent = 'جاري تحميل Firmware…';
  $('firmwareRetryBtn').disabled = true;
  try{
    const r = await fetch(FIRMWARE_URL + '?v=' + Date.now(), {cache:'no-store'});
    if(!r.ok) throw new Error('Firmware غير متاح بعد — HTTP ' + r.status);
    const bytes = new Uint8Array(await r.arrayBuffer());
    if(bytes.length < 150000) throw new Error('ملف Firmware غير مكتمل');
    state.firmware = {name:'modax-esp32-wroom32-full.bin', bytes, address:0x0};
    $('firmwareStatus').textContent = 'جاهز تلقائيًا — ' + Math.round(bytes.length/1024) + ' KB';
    setProgress(0,'Firmware جاهز');
    log('Firmware loaded automatically: ' + Math.round(bytes.length/1024) + ' KB');
  }catch(e){
    $('firmwareStatus').textContent = 'Firmware غير جاهز: ' + (e.message||e);
    log('Firmware load: ' + (e.message||e));
  }finally{
    $('firmwareRetryBtn').disabled = false;
    updateFlashButton();
  }
}

function browserCheck(){
  const secure = window.isSecureContext;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua);
  const android = /Android/i.test(ua);
  if(ios) $('browserBadge').textContent='iPhone/iPad: إعداد واستخدام AI فقط';
  else if(serialApi && secure){
    const mode = navigator.serial ? 'Web Serial' : 'WebUSB polyfill';
    $('browserBadge').textContent=android?'Android جاهز — '+mode:'جاهز — '+mode;
  } else if(!secure) $('browserBadge').textContent='يلزم HTTPS أو localhost';
  else $('browserBadge').textContent='المتصفح لا يدعم USB Serial';
  $('connectBtn').disabled = !serialApi || !secure || ios;
}

const terminal = {
  clean(){ $('terminal').textContent=''; },
  writeLine(data){ log(String(data)); },
  write(data){ const el=$('terminal'); el.textContent += String(data); el.scrollTop=el.scrollHeight; }
};

async function connect(){
  try{
    $('terminal').textContent=''; status('طلب منفذ USB…');
    state.port = await serialApi.requestPort();
    state.transport = new Transport(state.port, true);
    state.loader = new ESPLoader({ transport:state.transport, baudrate:115200, terminal, debugLogging:false });
    status('جاري اكتشاف الشريحة…');
    state.chip = await state.loader.main();
    $('chipName').textContent = state.chip || 'غير معروف';
    log('Detected: '+state.chip);
    try{
      const s = await state.loader.detectFlashSize?.();
      state.flashSize = s || '4MB';
    }catch(e){ state.flashSize='4MB'; log('Flash size detect fallback: 4MB'); }
    $('flashSize').textContent=state.flashSize;
    updateBoardMatch();
    if(isClassicEsp32()){
      status('متصل — البورد متوافقة');
      log('Board profile accepted: classic ESP32 / ESP-WROOM-32 DevKit.');
    }else{
      status('متصل — الشريحة غير متوافقة');
      log('SAFETY BLOCK: only classic ESP32 is allowed.');
    }
    $('connectBtn').disabled=true; $('disconnectBtn').disabled=false;
    updateFlashButton();
  }catch(e){
    state.loader=null; status('فشل الاتصال'); log('ERROR: '+(e.message||e)); $('connectBtn').disabled=!serialApi; updateBoardMatch(); updateFlashButton();
  }
}
async function disconnect(){
  try{ await state.transport?.disconnect(); }catch{}
  state.port=state.transport=state.loader=null; state.chip=''; state.flashSize='';
  $('chipName').textContent='—'; $('flashSize').textContent='—'; status('غير متصل');
  $('connectBtn').disabled=!serialApi; $('disconnectBtn').disabled=true; updateBoardMatch(); updateFlashButton();
}
async function flash(){
  if(!state.loader) return alert('وصل البورد أولًا.');
  if(!state.firmware) return alert('Firmware لم يكتمل تحميله بعد.');
  if(!isClassicEsp32()) return alert('تم منع التفليش: الشريحة ليست Classic ESP32 المتوقعة لهذه البورد.');
  if(!confirm('سيتم استبدال البرنامج الحالي على البورد ببرنامج MODAX. متابعة؟')) return;
  try{
    $('flashBtn').disabled=true; setProgress(0,'بدء التثبيت…');
    const flashSize = state.flashSize || '4MB';
    await state.loader.writeFlash({
      fileArray:[{data:state.firmware.bytes,address:0x0}],
      flashMode:'dio', flashFreq:'40m', flashSize, eraseAll:false, compress:true,
      reportProgress:(_idx,written,total)=>setProgress(total?written/total*100:0,Math.round(written/1024)+' / '+Math.round(total/1024)+' KB')
    });
    setProgress(100,'اكتمل التثبيت — إعادة تشغيل…');
    try{ await state.loader.after('hard_reset'); }catch{}
    log('Install complete. Wait for MODAX-XXXX if no saved Wi-Fi exists.');
    status('تم تثبيت MODAX');
  }catch(e){
    log('FLASH ERROR: '+(e.message||e)); setProgress(0,'فشل التثبيت — راجع السجل');
  }finally{ updateFlashButton(); }
}
async function startCamera(){
  try{
    state.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    const v=$('camera'); v.srcObject=state.stream; await v.play(); v.classList.remove('hidden');
    $('cameraBtn').disabled=true; $('stopCameraBtn').disabled=false;
  }catch(e){ alert('الكاميرا غير متاحة: '+(e.message||e)); }
}
function stopCamera(){ state.stream?.getTracks().forEach(t=>t.stop()); state.stream=null; $('camera').classList.add('hidden'); $('cameraBtn').disabled=false; $('stopCameraBtn').disabled=true; }
function snapshot(){
  const v=$('camera'); if(!state.stream || !v.videoWidth) return null;
  const c=$('snapshot'); const max=900; const scale=Math.min(1,max/v.videoWidth); c.width=Math.round(v.videoWidth*scale); c.height=Math.round(v.videoHeight*scale);
  c.getContext('2d').drawImage(v,0,0,c.width,c.height); return c.toDataURL('image/jpeg',0.78);
}
function voiceInput(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR) return alert('التعرف الصوتي غير متاح في هذا المتصفح.');
  const r=new SR(); r.lang='ar-EG'; r.interimResults=false; r.maxAlternatives=1;
  r.onresult=(e)=>{ $('prompt').value = ($('prompt').value+' '+e.results[0][0].transcript).trim(); };
  r.onerror=(e)=>alert('تعذر الإملاء: '+e.error); r.start();
}
function speak(text){ if(!('speechSynthesis' in window)||!text) return; speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text); u.lang='ar-EG'; speechSynthesis.speak(u); }
async function askAI(){
  const endpoint=$('apiEndpoint').value.trim(); const model=$('apiModel').value.trim(); const key=$('apiKey').value.trim(); const text=$('prompt').value.trim();
  if(!endpoint||!model||!text) return alert('أدخل Endpoint وModel والسؤال.');
  const answer=$('answer'); answer.textContent='جاري التفكير…';
  try{
    let content=text;
    if($('attachImage').checked){
      const img=snapshot(); if(!img) throw new Error('شغّل الكاميرا أولًا');
      content=[{type:'text',text},{type:'image_url',image_url:{url:img}}];
    }
    const headers={'Content-Type':'application/json'}; if(key) headers.Authorization='Bearer '+key;
    const r=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({model,messages:[{role:'user',content}],stream:false})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data?.error?.message||data?.message||('HTTP '+r.status));
    const out=data?.choices?.[0]?.message?.content ?? data?.output_text ?? JSON.stringify(data,null,2);
    answer.textContent=typeof out==='string'?out:JSON.stringify(out,null,2); speak(answer.textContent);
  }catch(e){ answer.textContent='خطأ: '+(e.message||e); }
}

$('connectBtn').addEventListener('click',connect);
$('disconnectBtn').addEventListener('click',disconnect);
$('firmwareRetryBtn').addEventListener('click',loadFirmware);
$('flashBtn').addEventListener('click',flash);
$('cameraBtn').addEventListener('click',startCamera);
$('stopCameraBtn').addEventListener('click',stopCamera);
$('micBtn').addEventListener('click',voiceInput);
$('askBtn').addEventListener('click',askAI);

browserCheck();
updateBoardMatch();
loadFirmware();
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});