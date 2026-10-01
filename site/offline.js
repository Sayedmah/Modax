import { Wllama } from './vendor/wllama/esm/index.js';

const $ = (id) => document.getElementById(id);
const MODEL_URL = 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf';
const CONFIG_PATHS = { default: './vendor/wllama/esm/wasm/wllama.wasm' };

let engine = null;
let ready = false;

function log(s=''){
  const el=$('offlineLog');
  el.textContent += s+'\n';
  el.scrollTop=el.scrollHeight;
}
function setProgress(p,text=''){
  const v=Math.max(0,Math.min(100,Number(p)||0));
  $('modelProgressBar').style.width=v+'%';
  $('modelProgressText').textContent=text||Math.round(v)+'%';
}
function setReady(v){
  ready=v;
  $('offlineAskBtn').disabled=!v;
  $('offlineBadge').textContent=v?'جاهز أوف لاين':'غير محمّل';
}

async function loadModel(){
  $('loadModelBtn').disabled=true;
  setReady(false);
  setProgress(0,'جاري تجهيز llama.cpp...');
  try{
    engine = new Wllama(CONFIG_PATHS,{
      allowOffline:true,
      parallelDownloads:3,
      logger:{
        debug:()=>{},
        log:(...a)=>log(a.join(' ')),
        warn:(...a)=>log('WARN '+a.join(' ')),
        error:(...a)=>log('ERROR '+a.join(' '))
      }
    });

    await engine.loadModelFromUrl(MODEL_URL,{
      n_ctx:2048,
      n_batch:256,
      progressCallback:({loaded,total})=>{
        const pct=total?loaded/total*100:0;
        const mb=Math.round((loaded||0)/1024/1024);
        const totalMb=Math.round((total||0)/1024/1024);
        setProgress(pct,'تنزيل/تحميل Qwen: '+mb+' / '+totalMb+' MB');
      }
    });

    setReady(true);
    setProgress(100,'جاهز أوف لاين — يمكنك فصل الإنترنت');
    log('Qwen2.5 0.5B loaded locally.');
  }catch(e){
    log('MODEL ERROR: '+(e?.message||e));
    setProgress(0,'فشل تحميل Qwen');
    $('loadModelBtn').disabled=false;
  }
}

async function ask(){
  if(!engine||!ready) return;
  const q=$('offlinePrompt').value.trim();
  if(!q) return;
  $('offlineAskBtn').disabled=true;
  $('offlineAnswer').textContent='Qwen يفكر محليًا...';
  try{
    const result=await engine.createChatCompletion({
      messages:[
        {role:'system',content:'أنت MODAX Offline وتعمل بالكامل على الهاتف. أجب بالعربية بشكل واضح ومفيد ومختصر.'},
        {role:'user',content:q}
      ],
      max_tokens:220,
      temperature:0.6,
      top_p:0.9
    });
    const text=result?.choices?.[0]?.message?.content||'لم يصل رد.';
    $('offlineAnswer').textContent=text;
    if('speechSynthesis' in window){
      speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(text);
      u.lang='ar-EG';
      speechSynthesis.speak(u);
    }
  }catch(e){
    $('offlineAnswer').textContent='خطأ محلي: '+(e?.message||e);
  }finally{
    $('offlineAskBtn').disabled=!ready;
  }
}

function voice(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR) return alert('الإملاء الصوتي غير متاح في هذا المتصفح.');
  const r=new SR();
  r.lang='ar-EG';
  r.interimResults=false;
  r.onresult=e=>{$('offlinePrompt').value=e.results[0][0].transcript;};
  r.start();
}

$('loadModelBtn').addEventListener('click',loadModel);
$('offlineAskBtn').addEventListener('click',ask);
$('offlineMicBtn').addEventListener('click',voice);

// Try local cache immediately. With allowOffline=true this succeeds when the
// model was downloaded before, even if the phone currently has no internet.
if(!navigator.onLine){
  log('الهاتف أوف لاين: سأحاول فتح Qwen من الكاش المحلي.');
  loadModel();
}