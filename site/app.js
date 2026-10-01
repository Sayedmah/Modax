const $ = (id) => document.getElementById(id);
const FIRMWARE_URL = './firmware/modax-esp32-wroom32-full.bin';
const CAPTIVE_FIRMWARE_URL = './firmware/mody-captive-portal-full.bin';
const UA = navigator.userAgent;
const IS_ANDROID = /Android/i.test(UA);
const IS_IOS = /iPhone|iPad|iPod/i.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IN_APP = /(FBAN|FBAV|Instagram|Line\/|wv\)|; wv|ChatGPT)/i.test(UA);
const KNOWN_USB_UARTS = [
  {vendorId:0x1A86, name:'WCH CH340/CH341/CH9102'},
  {vendorId:0x10C4, name:'Silicon Labs CP210x'},
  {vendorId:0x0403, name:'FTDI FT232'},
  {vendorId:0x303A, name:'Espressif USB/JTAG'},
  {vendorId:0x067B, name:'Prolific PL2303'}
];
const IS_SMART_DISPLAY = /(SmartTV|SMART-TV|Tizen|Web0S|NetCast|HbbTV|AFT|CrKey|BRAVIA)/i.test(UA) || (!IS_IOS && matchMedia?.('(pointer: coarse)').matches && Math.min(screen.width, screen.height) >= 600 && innerWidth >= 700);

const state = {
  port:null, transport:null, loader:null, chip:'', flashSize:'4MB',
  firmware:null, captiveFirmware:null, stream:null, mode:'', esptool:null
};

let installStartedAt=0;
let installTimerId=null;

function formatElapsed(ms){
  const sec=Math.max(0,ms)/1000;
  return sec<60 ? sec.toFixed(1)+' ثانية' : Math.floor(sec/60)+' د '+(sec%60).toFixed(0)+' ث';
}
function updateInstallProgress(pct,stage,detail='',kind='running'){
  const p=Math.max(0,Math.min(100,Number(pct)||0));
  if($('installProgressBar')) $('installProgressBar').style.width=p+'%';
  if($('installProgressPct')) $('installProgressPct').textContent=Math.round(p)+'%';
  if($('installStage')) $('installStage').textContent=stage||'جاري العمل…';
  if($('installProgressDetail')) $('installProgressDetail').textContent=detail||'';
  const card=$('installProgressCard');
  if(card){
    card.classList.toggle('progress-success',kind==='success');
    card.classList.toggle('progress-fail',kind==='fail');
    card.classList.toggle('progress-running',kind==='running');
  }
}
function startInstallTimer(){
  installStartedAt=performance.now();
  if(installTimerId) clearInterval(installTimerId);
  if($('installElapsed')) $('installElapsed').textContent='0.0 ثانية';
  installTimerId=setInterval(()=>{
    if($('installElapsed')) $('installElapsed').textContent=formatElapsed(performance.now()-installStartedAt);
  },100);
}
function stopInstallTimer(){
  if(installTimerId){clearInterval(installTimerId);installTimerId=null;}
  const elapsed=installStartedAt ? performance.now()-installStartedAt : 0;
  if($('installElapsed')) $('installElapsed').textContent=formatElapsed(elapsed);
  return elapsed;
}

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
function sleepMs(ms){ return new Promise(r=>setTimeout(r,ms)); }
function withTimeout(promise,ms,label='انتهت المهلة'){
  let timer;
  return Promise.race([
    promise,
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label)),ms);})
  ]).finally(()=>clearTimeout(timer));
}

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
  const directReady=!!(state.esptool?.WebUSBSerialPort && state.captiveFirmware);
  if($('oneClickFlashBtn2')) $('oneClickFlashBtn2').disabled=!directReady;
  if($('oneClickFlashBtn3')) $('oneClickFlashBtn3').disabled=!directReady;
  updateUsbDiagnostics(directSupported);
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
function setDiag(id,ok,label){
  const el=$(id); if(!el) return;
  el.textContent=label ?? (ok?'✓':'✕');
  el.classList.toggle('diag-ok',!!ok);
  el.classList.toggle('diag-bad',!ok);
}
function showInstallError(message){
  const el=$('directInstallError');
  if(!el) return;
  el.textContent=message;
  el.classList.remove('hidden');
}
function clearInstallError(){
  $('directInstallError')?.classList.add('hidden');
}
function updateUsbDiagnostics(directSupported=false){
  setDiag('diagAndroid',IS_ANDROID,IS_ANDROID?'✓':'—');
  setDiag('diagHttps',window.isSecureContext,window.isSecureContext?'✓':'✕');
  setDiag('diagUsb',!!navigator.usb,navigator.usb?'✓':'✕');
  setDiag('diagTool',!!state.esptool,state.esptool?'✓':'…');
  setDiag('diagFw',!!state.captiveFirmware,state.captiveFirmware?'✓':'…');
  if($('directInstallHint')){
    if(IS_IOS) $('directInstallHint').textContent='iPhone/iPad لا يسمح بالتفليش USB المباشر من Chrome؛ استخدم OTA.';
    else if(directSupported && state.captiveFirmware && state.esptool) $('directInstallHint').textContent='جاهز. اضغط التثبيت واختر USB الخاص بالـESP32.';
    else if(!navigator.usb) $('directInstallHint').textContent='Chrome لا يعرض WebUSB على هذا الجهاز/المتصفح.';
    else $('directInstallHint').textContent='جاري تجهيز أداة التفليش وFirmware…';
  }
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
    // Android must use WebUSB here. Some Chrome builds expose navigator.serial
    // but the native serial picker cannot enumerate this ESP32 USB-UART.
    if(navigator.usb && state.esptool?.WebUSBSerialPort){
      state.mode='webusb-ch340';
      $('connectionMode').textContent='Android WebUSB — CH340/CH341';
      $('browserBadge').textContent='Android جاهز — WebUSB';
      $('connectBtn').disabled=false;
    }else{
      state.mode='';
      $('connectionMode').textContent='WebUSB غير متاح';
      $('browserBadge').textContent='Google Chrome + WebUSB مطلوب';
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
    updateUsbDiagnostics(true);
    log('esptool-js 0.7.0 loaded.');
  }catch(e){
    updateUsbDiagnostics(false);
    showInstallError('فشل تحميل أداة التفليش من الإنترنت: '+(e.message||e));
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


async function loadCaptiveFirmware(trackInstall=false){
  state.captiveFirmware=null;
  updateFlashButton();
  try{
    if(trackInstall) updateInstallProgress(2,'تحميل Firmware','بدء التحميل…');
    const r=await fetch(CAPTIVE_FIRMWARE_URL+'?v='+Date.now(),{cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);

    const total=Number(r.headers.get('content-length'))||0;
    let bytes;

    if(r.body && total>0){
      const reader=r.body.getReader();
      const chunks=[];
      let received=0;
      while(true){
        const {done,value}=await reader.read();
        if(done) break;
        chunks.push(value);
        received+=value.length;
        if(trackInstall){
          const pct=2+(received/total)*18;
          updateInstallProgress(pct,'تحميل Firmware',
            Math.round(received/1024)+' / '+Math.round(total/1024)+' KB');
        }
      }
      bytes=new Uint8Array(received);
      let pos=0;
      for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.length;}
    }else{
      bytes=new Uint8Array(await r.arrayBuffer());
      if(trackInstall) updateInstallProgress(20,'تحميل Firmware',Math.round(bytes.length/1024)+' KB تم التحميل');
    }

    if(bytes.length<100000) throw new Error('Captive Portal firmware غير مكتمل');
    state.captiveFirmware={name:'mody-captive-portal-full.bin',bytes,address:0x0};
    if(trackInstall) updateInstallProgress(20,'Firmware جاهز',Math.round(bytes.length/1024)+' KB');
    updateUsbDiagnostics(true);
    log('Captive Portal firmware ready: '+Math.round(bytes.length/1024)+' KB');
  }catch(e){
    updateUsbDiagnostics(false);
    if(trackInstall){
      const elapsed=stopInstallTimer();
      updateInstallProgress(0,'فشل تحميل Firmware',(e.message||e)+' — '+formatElapsed(elapsed),'fail');
    }
    showInstallError('تعذر تحميل Firmware: '+(e.message||e));
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

async function detectUsbBoard(){
  if(!navigator.usb) throw new Error('WebUSB غير متاح في هذا المتصفح');
  const filters = KNOWN_USB_UARTS.map(x=>({vendorId:x.vendorId}));
  const dev = await navigator.usb.requestDevice({filters});
  const info = {
    vendorId: dev.vendorId,
    productId: dev.productId,
    productName: dev.productName || 'USB device',
    manufacturerName: dev.manufacturerName || ''
  };
  const family = KNOWN_USB_UARTS.find(x=>x.vendorId===dev.vendorId)?.name || 'Unknown USB-UART';
  if($('usbInfo')) $('usbInfo').textContent =
    family+' — '+hex4(dev.vendorId)+':'+hex4(dev.productId);
  log('USB FOUND: '+family+' '+hex4(dev.vendorId)+':'+hex4(dev.productId)+' '+info.productName);
  return {dev, family, info};
}

async function requestPort(preselectedUsb=null){
  if(state.mode==='webusb-ch340'){
    log('Opening ESP32 USB-UART…');
    const found = preselectedUsb ? {
      dev: preselectedUsb,
      family: KNOWN_USB_UARTS.find(x=>x.vendorId===preselectedUsb.vendorId)?.name || 'Unknown USB-UART',
      info: {
        vendorId: preselectedUsb.vendorId,
        productId: preselectedUsb.productId,
        productName: preselectedUsb.productName || 'USB device',
        manufacturerName: preselectedUsb.manufacturerName || ''
      }
    } : await detectUsbBoard();
    if(found.info.vendorId!==0x1A86){
      throw new Error('تم العثور على '+found.family+' لكن التفليش من Android WebUSB مهيأ حاليًا لـWCH CH340/CH341. VID:PID '+hex4(found.info.vendorId)+':'+hex4(found.info.productId));
    }
    const adapter=new state.esptool.WebUSBSerialPort(found.dev);
    const info=adapter.getInfo?.()||{};
    log('Using WCH WebUSB adapter: '+hex4(info.usbVendorId)+':'+hex4(info.usbProductId));
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
  if(/No device selected|NotFoundError|user cancelled/i.test(s)) return 'لم يتم اختيار الجهاز. افتح التثبيت مرة أخرى، اضغط على سطر USB Serial أولًا، وبعدها اضغط «اتصال».';
  if(/CH343|55d3/i.test(s)) return 'المحول CH343 وليس CH340؛ هذه النسخة تحتاج مسار USB مختلف.';
  if(/Couldn't sync|Failed to connect|sync|مهلة الاتصال|Connect timeout/i.test(s)) return 'USB اتفتح لكن ESP32 لم تكمل RESET/SYNC خلال المهلة. الموقع وقف المحاولة تلقائيًا بدل التعليق.';
  if(/claim|interface|Access denied|permission/i.test(s)) return 'Android لم يسمح بالوصول إلى USB. افصل البورد، أعد توصيلها، وافق على إذن USB لـChrome ثم جرّب مرة أخرى.';
  return s;
}

async function connect(preselectedUsb=null, rethrow=false){
  try{
    $('terminal').textContent='';
    if(installStartedAt) updateInstallProgress(25,'فتح USB','فتح جلسة USB واحدة…');
    status('فتح USB…');

    state.port=await requestPort(preselectedUsb);
    state.transport=new state.esptool.Transport(state.port,true);
    state.loader=new state.esptool.ESPLoader({
      transport:state.transport,
      baudrate:115200,
      romBaudrate:115200,
      terminal,
      debugLogging:false
    });

    if(installStartedAt) updateInstallProgress(30,'الاتصال بالـESP32','RESET + SYNC…');
    status('الاتصال بالـESP32…');

    // One USB session only. Let esptool drive DTR/RTS itself.
    state.chip=await withTimeout(
      state.loader.main('default_reset'),
      18000,
      'Connect timeout بعد 18 ثانية'
    );

    $('chipName').textContent=state.chip||'غير معروف';
    log('Detected chip: '+state.chip);

    try{
      const s=await withTimeout(state.loader.detectFlashSize?.(),4000,'Flash-size timeout');
      if(s) state.flashSize=s;
    }catch(e){
      state.flashSize='4MB';
      log('Flash size fallback: 4MB');
    }
    $('flashSize').textContent=state.flashSize||'4MB';

    updateBoardMatch();
    if(!isClassicEsp32()){
      throw new Error('الشريحة غير متوافقة مع Firmware الحالي: '+state.chip);
    }

    if(installStartedAt) updateInstallProgress(40,'تم الاتصال ✅','ESP32 جاهز للتثبيت');
    status('متصل — جاهز للتثبيت');
    $('connectBtn').disabled=true;
    $('disconnectBtn').disabled=false;
    updateFlashButton();
    return true;
  }catch(e){
    const msg=friendlyError(e);

    // Break any pending WebUSB operation without waiting indefinitely.
    try{
      const closePromise=state.port?.close?.();
      if(closePromise?.catch) closePromise.catch(()=>{});
    }catch(_){}

    state.port=state.transport=state.loader=null;
    state.chip='';
    status('فشل الاتصال');
    log('CONNECT ERROR: '+msg);
    log('RAW: '+String(e?.stack||e));
    $('connectBtn').disabled=false;
    $('disconnectBtn').disabled=true;
    updateBoardMatch();
    updateFlashButton();
    showInstallError(msg);
    if(rethrow) throw e;
    return false;
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
    if(installStartedAt) updateInstallProgress(42,'تثبيت Firmware','بدء الكتابة على الفلاش…');
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
        if(installStartedAt){
          const overall=42+(pct*0.58);
          updateInstallProgress(overall,'تثبيت Firmware',Math.round(written/1024)+' / '+Math.round(total/1024)+' KB');
        }
      }
    });
    setProgress(100,'اكتمل التثبيت');
    status('تم تثبيت '+label);
    log('Flash complete.');
    try{ await state.loader.after('hard_reset'); }catch(e){ log('Reset note: '+(e.message||e)); }
    if(installStartedAt){
      const elapsed=stopInstallTimer();
      updateInstallProgress(100,'تم التثبيت بنجاح ✅','المدة: '+formatElapsed(elapsed),'success');
    }
    alert('تم تثبيت '+label+' بنجاح.');
  }catch(e){
    const msg=friendlyError(e);
    log('FLASH ERROR: '+msg);
    log('RAW: '+String(e?.stack||e));
    setProgress(0,'فشل التثبيت — راجع السجل');
    if(installStartedAt){
      const elapsed=stopInstallTimer();
      updateInstallProgress(0,'فشل التثبيت ❌',msg+' — بعد '+formatElapsed(elapsed),'fail');
    }
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

async function searchAnyUsb(){
  clearInstallError();
  if(!navigator.usb){
    showInstallError('WebUSB غير متاح في هذا المتصفح.');
    return;
  }
  try{
    status('جاري فحص كل أجهزة USB…');
    // Empty filter object asks Chrome to show any selectable USB device.
    const dev=await navigator.usb.requestDevice({filters:[{}]});
    const family=KNOWN_USB_UARTS.find(x=>x.vendorId===dev.vendorId)?.name || 'USB غير معروف';
    if($('usbInfo')) $('usbInfo').textContent=family+' — '+hex4(dev.vendorId)+':'+hex4(dev.productId);
    status('تم العثور على USB');
    log('ANY USB FOUND: '+family+' '+hex4(dev.vendorId)+':'+hex4(dev.productId)+' '+(dev.productName||''));
    showInstallError('تم العثور على USB: '+family+' '+hex4(dev.vendorId)+':'+hex4(dev.productId)+'. لو مش CH340/CH341 ابعتلي VID:PID.');
  }catch(e){
    const msg=friendlyError(e);
    status('لا يوجد USB ظاهر');
    if(/No device selected|NotFoundError|user cancelled/i.test(String(e?.message||e))){
      showInstallError('Android لم يرَ أي جهاز USB Data. لمبة البوردة ممكن تنور لأن الكهرباء فقط واصلة. استخدم OTG حقيقي + كابل بيانات.');
    }else{
      showInstallError(msg);
    }
  }
}

async function searchBoardOnly(){
  clearInstallError();
  try{
    if(!navigator.usb){
      showInstallError('WebUSB غير متاح. افتح الموقع في Google Chrome على Android.');
      return;
    }
    status('جاري البحث عن USB…');
    const found=await detectUsbBoard();
    status('تم العثور على USB');
    if($('boardMatch')) $('boardMatch').textContent =
      found.info.vendorId===0x1A86 ? 'USB مناسب لـCH340/CH341' : 'تم العثور على USB — يحتاج مسار مختلف';
  }catch(e){
    const msg=friendlyError(e);
    showInstallError(msg);
    status('لم يتم اختيار USB');
  }
}

async function oneClickFlash(){
  clearInstallError();

  if(IS_IOS){
    showInstallError('iPhone/iPad لا يدعم التفليش USB المباشر من Chrome. استخدم OTA.');
    return;
  }
  if(!window.isSecureContext){
    showInstallError('افتح الموقع عبر HTTPS.');
    return;
  }

  // All asynchronous assets are preloaded on page load. Do not do any await
  // before the USB chooser or Chrome may drop the user-gesture permission.
  if(!state.esptool?.WebUSBSerialPort || !state.captiveFirmware){
    showInstallError('الموقع ما زال يجهز Flasher/Firmware. انتظر حتى يظهر Flasher ✓ وFirmware ✓ ثم اضغط مرة ثانية.');
    return;
  }

  startInstallTimer();
  updateInstallProgress(2,'اختيار USB','اضغط USB Serial ثم اتصال');

  try{
    if(IS_ANDROID){
      // Official esptool-js CH340 WebUSB path.
      const adapter=await state.esptool.WebUSBSerialPort.requestPort();
      const info=adapter.getInfo?.()||{};
      if($('usbInfo')) $('usbInfo').textContent=hex4(info.usbVendorId)+':'+hex4(info.usbProductId);
      log('WebUSB selected: '+hex4(info.usbVendorId)+':'+hex4(info.usbProductId));

      const port=adapter.asSerialPort();
      const transport=new state.esptool.Transport(port,true);
      const loader=new state.esptool.ESPLoader({
        transport,
        baudrate:115200,
        terminal,
        debugLogging:false
      });

      state.port=port;
      state.transport=transport;
      state.loader=loader;
      state.mode='webusb-ch340';

      updateInstallProgress(15,'الاتصال بالـESP32','RESET + SYNC…');
      status('الاتصال بالـESP32…');

      const chip=await withTimeout(
        loader.main(),
        18000,
        'Connect timeout بعد 18 ثانية'
      );
      state.chip=chip;
      $('chipName').textContent=chip||'غير معروف';
      log('Detected chip: '+chip);

      if(!isClassicEsp32()){
        throw new Error('الشريحة المكتشفة ليست ESP32 الكلاسيكي: '+chip);
      }

      updateBoardMatch();
      updateInstallProgress(40,'تم الاتصال ✅','بدء تثبيت Firmware…');
      status('متصل — جاري التثبيت');
      await flash(true,state.captiveFirmware,'MODY Captive Portal');
      return;
    }

    // Desktop keeps the existing connector path.
    if(!state.loader) await connect(null,true);
    if(!state.loader) throw new Error('تعذر الاتصال بالـESP32');
    if(!isClassicEsp32()) throw new Error('الشريحة المكتشفة ليست ESP32 الكلاسيكي');
    await flash(true,state.captiveFirmware,'MODY Captive Portal');
  }catch(e){
    const msg=friendlyError(e);
    const elapsed=stopInstallTimer();
    updateInstallProgress(0,'فشل التثبيت ❌',msg+' — بعد '+formatElapsed(elapsed),'fail');
    showInstallError(msg);
    log('ONE CLICK ERROR: '+msg);
    log('RAW: '+String(e?.stack||e));
    try{
      const p=state.port?.close?.();
      if(p?.catch) p.catch(()=>{});
    }catch(_){}
    state.port=state.transport=state.loader=null;
    state.chip='';
    updateBoardMatch();
    updateFlashButton();
  }
}

$('connectBtn')?.addEventListener('click',connect);
$('disconnectBtn')?.addEventListener('click',disconnect);
$('firmwareRetryBtn')?.addEventListener('click',loadFirmware);
$('flashBtn')?.addEventListener('click',()=>flash(false,null,'MODAX'));
$('oneClickFlashBtn')?.addEventListener('click',oneClickFlash);
$('oneClickFlashBtn2')?.addEventListener('click',oneClickFlash);
$('oneClickFlashBtn3')?.addEventListener('click',oneClickFlash);
$('searchBoardBtn')?.addEventListener('click',searchBoardOnly);
$('searchAnyUsbBtn')?.addEventListener('click',searchAnyUsb);
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
updateUsbDiagnostics(false);
updateInstallProgress(0,'جاهز للتثبيت','لم يبدأ بعد','idle');

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
