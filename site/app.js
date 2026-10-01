const $ = (id) => document.getElementById(id);
const FIRMWARE_URL = './firmware/modax-esp32-wroom32-full.bin';
const CAPTIVE_FIRMWARE_URL = './firmware/mody-captive-portal-full.bin';
const UA = navigator.userAgent;
const IS_ANDROID = /Android/i.test(UA);
const IS_IOS = /iPhone|iPad|iPod/i.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IN_APP = /(FBAN|FBAV|Instagram|Line\/|wv\)|; wv|ChatGPT)/i.test(UA);
const IS_SMART_DISPLAY = /(SmartTV|SMART-TV|Tizen|Web0S|NetCast|HbbTV|AFT|CrKey|BRAVIA)/i.test(UA) || (!IS_IOS && matchMedia?.('(pointer: coarse)').matches && Math.min(screen.width, screen.height) >= 600 && innerWidth >= 700);

const state = {
  port:null, transport:null, loader:null, chip:'', flashSize:'4MB',
  firmware:null, captiveFirmware:null, stream:null, mode:'', esptool:null
};

function log(line='') {
  const el=$('terminal');
  if(!el) return;
  el.textContent += line + '\n';
  el.scrollTop=el.scrollHeight;
}
function status(text){ if($('deviceState')) $('deviceState').textContent=text; }
function setProgress(p,text=''){
  const v=Math.max(0,Math.min(100,p||0));
  if($('progressBar')) $('progressBar').style.width=v+'%';
  if($('progressText')) $('progressText').textContent=text||v.toFixed(1)+'%';
}
function hex4(n){ return n==null?'----':'0x'+Number(n).toString(16).padStart(4,'0'); }

function isClassicEsp32(){
  const c=String(state.chip||'').toUpperCase();
  if(!c.includes('ESP32')) return false;
  return !/ESP32[- ]?(S2|S3|C2|C3|C5|C6|C61|H2|P4)/i.test(c);
}
function updateBoardMatch(){
  if(!$('boardMatch')) return;
  $('boardMatch').textContent = !state.loader ? 'لم يتم الفحص'
    : isClassicEsp32() ? 'مطابق لـ ESP32-WROOM-32'
    : 'غير مطابق — التفليش محظور';
}
function updateFlashButton(){
  const ready = !!(state.loader && state.firmware && isClassicEsp32());
  if($('flashBtn')) $('flashBtn').disabled=!ready;
  const directSupported = !IS_IOS && window.isSecureContext &&
    ((IS_ANDROID && navigator.usb && state.esptool?.WebUSBSerialPort) ||
     (!IS_ANDROID && (navigator.serial || (navigator.usb && state.esptool?.WebUSBSerialPort))));
  if($('oneClickFlashBtn2')) $('oneClickFlashBtn2').disabled=!directSupported || !state.captiveFirmware || !state.esptool;
}

function showIosMode(){
  $('iosSection')?.classList.remove('hidden');
  $('usbSection')?.classList.add('hidden');
  $('browserBadge').textContent='iOS جاهز — OTA عبر Wi-Fi';
  if($('connectionMode')) $('connectionMode').textContent='OTA عبر Wi-Fi';
}

function markPlatform(){
  const android=$('androidCard'), ios=$('iosCard'), smart=$('smartCard');
  [android,ios,smart].forEach(x=>x?.classList.remove('active'));
  let label='كمبيوتر / متصفح';
  if(IS_IOS){ ios?.classList.add('active'); label='iPhone / iPad — OTA'; }
  else if(IS_SMART_DISPLAY){ smart?.classList.add('active'); label='Smart Screen'; }
  else if(IS_ANDROID){ android?.classList.add('active'); label='Android'; }
  if($('platformModeBadge')) $('platformModeBadge').textContent=label;
}
function browserCheck(){
  markPlatform();
  const secure=window.isSecureContext;
  if(IS_IOS){
    showIosMode();
    return;
  }
  if(!secure){
    $('browserBadge').textContent='يلزم HTTPS';
    $('connectBtn').disabled=true;
    return;
  }
  if(IN_APP){
    $('browserBadge').textContent='افتح الرابط في Google Chrome';
    $('connectBtn').disabled=true;
    log('هذا متصفح داخلي. افتح نفس الرابط في Google Chrome ثم جرّب.');
    return;
  }
  if(IS_ANDROID){
    if(navigator.usb && state.esptool?.WebUSBSerialPort){
      state.mode='webusb-ch340';
      $('connectionMode').textContent='Android WebUSB — CH340/CH341';
      $('browserBadge').textContent='Android جاهز — USB';
      $('connectBtn').disabled=false;
    }else{
      $('browserBadge').textContent='Chrome Android + WebUSB مطلوب';
      $('connectBtn').disabled=true;
    }
    return;
  }
  if(navigator.serial){
    state.mode='webserial';
    $('connectionMode').textContent='Web Serial';
    $('browserBadge').textContent='الكمبيوتر جاهز — Web Serial';
    $('connectBtn').disabled=false;
  }else if(navigator.usb && state.esptool?.WebUSBSerialPort){
    state.mode='webusb-ch340';
    $('connectionMode').textContent='WebUSB — CH340/CH341';
    $('browserBadge').textContent='WebUSB جاهز';
    $('connectBtn').disabled=false;
  }else{
    $('browserBadge').textContent='استخدم Chrome أو Edge';
    $('connectBtn').disabled=true;
  }
}

async function loadEsptool(){
  if(IS_IOS) return browserCheck();
  try{
    $('browserBadge').textContent='جاري تحميل أداة ESP…';
    state.esptool = await import('https://unpkg.com/esptool-js@0.7.0/bundle.js');
    if(!state.esptool?.ESPLoader || !state.esptool?.Transport){
      throw new Error('esptool-js لم يتم تحميله بالشكل الصحيح');
    }
    browserCheck();
    updateFlashButton();
    log('esptool-js 0.7.0 loaded.');
  }catch(e){
    $('browserBadge').textContent='فشل تحميل أداة التفليش';
    log('TOOL ERROR: '+(e.message||e));
    if($('connectBtn')) $('connectBtn').disabled=true;
  }
}

async function loadFirmware(){
  if(IS_IOS) return;
  state.firmware=null;
  updateFlashButton();
  $('firmwareStatus').textContent='جاري تحميل Firmware…';
  $('firmwareRetryBtn').disabled=true;
  try{
    const r=await fetch(FIRMWARE_URL+'?v='+Date.now(),{cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const bytes=new Uint8Array(await r.arrayBuffer());
    if(bytes.length<150000) throw new Error('الملف غير مكتمل');
    state.firmware={name:'modax-esp32-wroom32-full.bin',bytes,address:0x0};
    $('firmwareStatus').textContent='جاهز تلقائيًا — '+Math.round(bytes.length/1024)+' KB';
    setProgress(0,'Firmware جاهز');
    log('Firmware ready: '+Math.round(bytes.length/1024)+' KB');
  }catch(e){
    $('firmwareStatus').textContent='تعذر تحميل Firmware: '+(e.message||e);
    log('FIRMWARE ERROR: '+(e.message||e));
  }finally{
    $('firmwareRetryBtn').disabled=false;
    updateFlashButton();
  }
}


async function loadCaptiveFirmware(){
  state.captiveFirmware=null;
  updateFlashButton();
  try{
    const r=await fetch(CAPTIVE_FIRMWARE_URL+'?v='+Date.now(),{cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const bytes=new Uint8Array(await r.arrayBuffer());
    if(bytes.length<100000) throw new Error('Captive Portal firmware غير مكتمل');
    state.captiveFirmware={name:'mody-captive-portal-full.bin',bytes,address:0x0};
    log('Captive Portal firmware ready: '+Math.round(bytes.length/1024)+' KB');
  }catch(e){
    log('CAPTIVE FIRMWARE: '+(e.message||e));
  }finally{
    updateFlashButton();
  }
}

const terminal={
  clean(){ if($('terminal')) $('terminal').textContent=''; },
  writeLine(data){ log(String(data)); },
  write(data){
    const el=$('terminal');
    if(!el) return;
    el.textContent+=String(data);
    el.scrollTop=el.scrollHeight;
  }
};

async function requestPort(){
  if(state.mode==='webusb-ch340'){
    log('Opening Android WebUSB picker for WCH CH340/CH341…');
    const adapter=await state.esptool.WebUSBSerialPort.requestPort();
    const info=adapter.getInfo?.()||{};
    $('usbInfo').textContent=hex4(info.usbVendorId)+':'+hex4(info.usbProductId);
    log('USB adapter: '+hex4(info.usbVendorId)+':'+hex4(info.usbProductId));
    return adapter.asSerialPort();
  }
  if(state.mode==='webserial'){
    const port=await navigator.serial.requestPort();
    const info=port.getInfo?.()||{};
    $('usbInfo').textContent=hex4(info.usbVendorId)+':'+hex4(info.usbProductId);
    log('Serial USB: '+hex4(info.usbVendorId)+':'+hex4(info.usbProductId));
    return port;
  }
  throw new Error('لا توجد طريقة اتصال USB متاحة');
}

function friendlyError(e){
  const s=String(e?.message||e||'');
  if(/No device selected|NotFoundError|user cancelled/i.test(s)) return 'لم يتم اختيار جهاز USB.';
  if(/CH343|55d3/i.test(s)) return 'المحول CH343 وليس CH340؛ هذه النسخة تحتاج مسار USB مختلف.';
  if(/Couldn't sync|Failed to connect|sync/i.test(s)) return 'تم فتح USB لكن ESP32 لم تدخل وضع التحميل. استخدم BOOT + EN ثم أعد التوصيل.';
  if(/claim|interface|Access denied|permission/i.test(s)) return 'Android لم يسمح بالوصول إلى USB. افصل الكابل، أعد توصيله ووافق على إذن Chrome.';
  return s;
}

async function connect(){
  try{
    $('terminal').textContent='';
    status('طلب إذن USB…');
    state.port=await requestPort();
    state.transport=new state.esptool.Transport(state.port,true);
    state.loader=new state.esptool.ESPLoader({
      transport:state.transport,
      baudrate:115200,
      terminal,
      debugLogging:false
    });
    status('جاري اكتشاف ESP32…');
    state.chip=await state.loader.main('default_reset');
    $('chipName').textContent=state.chip||'غير معروف';
    log('Detected chip: '+state.chip);

    try{
      const s=await state.loader.detectFlashSize?.();
      if(s) state.flashSize=s;
    }catch(e){ log('Flash size fallback: 4MB'); }
    $('flashSize').textContent=state.flashSize||'4MB';

    updateBoardMatch();
    if(isClassicEsp32()){
      status('متصل — جاهز للتثبيت');
      log('Board accepted: classic ESP32.');
    }else{
      status('الشريحة غير متوافقة');
      log('SAFETY BLOCK: only classic ESP32.');
    }
    $('connectBtn').disabled=true;
    $('disconnectBtn').disabled=false;
    updateFlashButton();
  }catch(e){
    const msg=friendlyError(e);
    state.loader=null;
    status('فشل الاتصال');
    log('CONNECT ERROR: '+msg);
    log('RAW: '+String(e?.stack||e));
    $('connectBtn').disabled=false;
    $('disconnectBtn').disabled=true;
    updateBoardMatch();
    updateFlashButton();
  }
}

async function disconnect(){
  try{ await state.transport?.disconnect(); }catch(e){ log('Disconnect: '+(e.message||e)); }
  state.port=state.transport=state.loader=null;
  state.chip='';
  $('chipName').textContent='—';
  $('flashSize').textContent='—';
  $('usbInfo').textContent='—';
  status('غير متصل');
  $('connectBtn').disabled=false;
  $('disconnectBtn').disabled=true;
  updateBoardMatch();
  updateFlashButton();
}

async function flash(skipConfirm=false, firmwareOverride=null, label='MODAX'){
  if(!state.loader) return alert('وصل البورد أولًا.');
  const targetFirmware=firmwareOverride || state.firmware;
  if(!targetFirmware) return alert('Firmware لم يكتمل تحميله.');
  if(!isClassicEsp32()) return alert('تم منع التفليش لأن الشريحة ليست ESP32 الكلاسيكي.');
  if(!skipConfirm && !confirm('سيتم استبدال البرنامج الحالي على البورد ببرنامج '+label+'. متابعة؟')) return;
  try{
    $('flashBtn').disabled=true;
    setProgress(0,'بدء التثبيت…');
    await state.loader.writeFlash({
      fileArray:[{data:targetFirmware.bytes,address:0x0}],
      flashMode:'dio',
      flashFreq:'40m',
      flashSize:'4MB',
      eraseAll:false,
      compress:true,
      reportProgress:(_idx,written,total)=>{
        const pct=total?written/total*100:0;
        setProgress(pct,Math.round(pct)+'% — '+Math.round(written/1024)+' / '+Math.round(total/1024)+' KB');
      }
    });
    setProgress(100,'اكتمل التثبيت');
    status('تم تثبيت '+label);
    log('Flash complete.');
    try{ await state.loader.after('hard_reset'); }catch(e){ log('Reset note: '+(e.message||e)); }
    alert('تم تثبيت '+label+' بنجاح.');
  }catch(e){
    const msg=friendlyError(e);
    log('FLASH ERROR: '+msg);
    log('RAW: '+String(e?.stack||e));
    setProgress(0,'فشل التثبيت — راجع السجل');
  }finally{
    updateFlashButton();
  }
}

async function startCamera(){
  try{
    state.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    const v=$('camera');
    v.srcObject=state.stream;
    await v.play();
    v.classList.remove('hidden');
    $('cameraBtn').disabled=true;
    $('stopCameraBtn').disabled=false;
  }catch(e){ alert('الكاميرا غير متاحة: '+(e.message||e)); }
}
function stopCamera(){
  state.stream?.getTracks().forEach(t=>t.stop());
  state.stream=null;
  $('camera').classList.add('hidden');
  $('cameraBtn').disabled=false;
  $('stopCameraBtn').disabled=true;
}
function snapshot(){
  const v=$('camera');
  if(!state.stream||!v.videoWidth) return null;
  const c=$('snapshot');
  const max=900, scale=Math.min(1,max/v.videoWidth);
  c.width=Math.round(v.videoWidth*scale);
  c.height=Math.round(v.videoHeight*scale);
  c.getContext('2d').drawImage(v,0,0,c.width,c.height);
  return c.toDataURL('image/jpeg',0.78);
}
function voiceInput(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR) return alert('التعرف الصوتي غير متاح في هذا المتصفح.');
  const r=new SR();
  r.lang='ar-EG'; r.interimResults=false; r.maxAlternatives=1;
  r.onresult=(e)=>{ $('prompt').value=($('prompt').value+' '+e.results[0][0].transcript).trim(); };
  r.onerror=(e)=>alert('تعذر الإملاء: '+e.error);
  r.start();
}
function speak(text){
  if(!('speechSynthesis' in window)||!text) return;
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);
  u.lang='ar-EG';
  speechSynthesis.speak(u);
}
async function askAI(){
  const endpoint=$('apiEndpoint').value.trim();
  const model=$('apiModel').value.trim();
  const key=$('apiKey').value.trim();
  const text=$('prompt').value.trim();
  if(!endpoint||!model||!text) return alert('أدخل Endpoint وModel والسؤال.');
  const answer=$('answer');
  answer.textContent='جاري التفكير…';
  try{
    let content=text;
    if($('attachImage').checked){
      const img=snapshot();
      if(!img) throw new Error('شغّل الكاميرا أولًا');
      content=[{type:'text',text},{type:'image_url',image_url:{url:img}}];
    }
    const headers={'Content-Type':'application/json'};
    if(key) headers.Authorization='Bearer '+key;
    const r=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({model,messages:[{role:'user',content}],stream:false})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data?.error?.message||data?.message||('HTTP '+r.status));
    const out=data?.choices?.[0]?.message?.content ?? data?.output_text ?? JSON.stringify(data,null,2);
    answer.textContent=typeof out==='string'?out:JSON.stringify(out,null,2);
    speak(answer.textContent);
  }catch(e){ answer.textContent='خطأ: '+(e.message||e); }
}

async function oneClickFlash(){
  if(IS_IOS){
    alert('iPhone/iPad لا يدعم التفليش USB المباشر من Chrome. استخدم OTA بعد أول تثبيت.');
    return;
  }
  try{
    if(!state.captiveFirmware){
      await loadCaptiveFirmware();
      if(!state.captiveFirmware) return alert('تعذر تحميل Firmware الـCaptive Portal.');
    }
    if(!state.esptool){
      await loadEsptool();
      if(!state.esptool) return alert('تعذر تحميل أداة التفليش.');
    }
    if(!confirm('سيتم توصيل ESP32 وفحص نوع الشريحة ثم تثبيت Firmware مباشرة من Chrome. متابعة؟')) return;
    if(!state.loader) await connect();
    if(!state.loader) return;
    if(!isClassicEsp32()) return alert('تم منع التفليش لأن الشريحة ليست ESP32 الكلاسيكي.');
    await flash(true,state.captiveFirmware,'MODY Captive Portal');
  }catch(e){
    log('ONE CLICK ERROR: '+friendlyError(e));
  }
}

$('connectBtn')?.addEventListener('click',connect);
$('disconnectBtn')?.addEventListener('click',disconnect);
$('firmwareRetryBtn')?.addEventListener('click',loadFirmware);
$('flashBtn')?.addEventListener('click',()=>flash(false,null,'MODAX'));
$('oneClickFlashBtn')?.addEventListener('click',oneClickFlash);
$('oneClickFlashBtn2')?.addEventListener('click',oneClickFlash);
$('cameraBtn')?.addEventListener('click',startCamera);
$('stopCameraBtn')?.addEventListener('click',stopCamera);
$('micBtn')?.addEventListener('click',voiceInput);
$('askBtn')?.addEventListener('click',askAI);

if(IS_IOS){
  browserCheck();
}else{
  loadFirmware();
  loadCaptiveFirmware();
  loadEsptool();
}
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});

$('copyPinsBtn')?.addEventListener('click', async ()=>{
  const text='UP GPIO32\nDOWN GPIO33\nLEFT GPIO25\nRIGHT GPIO26\nACTION GPIO27\nLED Red GPIO12 via 220Ω\nLED Green GPIO13 via 220Ω\nBuzzer GPIO14\nAll grounds -> ESP32 GND';
  try{
    await navigator.clipboard.writeText(text);
    $('copyPinsBtn').textContent='تم النسخ ✓';
    setTimeout(()=>$('copyPinsBtn').textContent='نسخ التوصيلات',1400);
  }catch(e){
    alert(text);
  }
});
markPlatform();

function forceDownload(url,name){
  const a=document.createElement('a');
  a.href=url;
  a.download=name;
  a.rel='noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
['directDownloadBtn','directDownloadBtn2'].forEach(id=>{
  $(id)?.addEventListener('click',(e)=>{
    // Keep the native same-origin download flow; this works on Android/desktop
    // and hands off to Files/Downloads on iOS according to the browser.
    const a=e.currentTarget;
    a.setAttribute('download','mody-captive-portal-5buttons.ino');
  });
});
