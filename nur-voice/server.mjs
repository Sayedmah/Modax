import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const SYSTEM = 'You are Nur (نور), an approachable, curious and capable personal AI assistant. Speak natural Egyptian Arabic when the user speaks colloquial Arabic, Modern Standard Arabic for formal Arabic and English for English. Be clear, truthful and concise. Do not invent access to the user devices or NAS. You are the WEB edition of Nur; do not pretend to be the original hardware hub. For safety do not execute shell commands.';
const TYPES = new Set(['audio/webm','audio/mp4','audio/m4a','audio/wav','audio/ogg','audio/mpeg','audio/x-m4a']);
class ApiError extends Error {
  constructor(status, message){super(message);this.status=status;}
}
export function validateMessages(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 24) throw new ApiError(400,'عدد الرسائل غير صالح');
  const messages=value.map((m)=>{
    if (!m || !['user','assistant'].includes(m.role) || typeof m.content !== 'string') throw new ApiError(400,'صيغة الرسائل غير صالحة');
    const content=m.content.trim();
    if (!content || content.length > 9000) throw new ApiError(400,'حجم الرسالة غير صالح');
    return {role:m.role,content};
  });
  if (messages.at(-1).role !== 'user') throw new ApiError(400,'الرسالة الأخيرة يجب أن تكون من المستخدم');
  return messages;
}
export function safeModel(value, fallback){
  if (!value) return fallback;
  if(typeof value !== 'string' || !/^[a-zA-Z0-9._:/-]{2,100}$/.test(value)) throw new ApiError(400,'اسم النموذج غير صالح');
  return value;
}
function keyFor(body, provider, req) {
  const own=typeof body.apiKey==='string' ? body.apiKey.trim() : '';
  if(own && own.length>300) throw new ApiError(400,'المفتاح غير صالح');
  if(own) return own;
  const serverKey=provider==='gemini' ? process.env.NUR_GEMINI_KEY : process.env.NUR_OPENROUTER_KEY;
  if(!serverKey) throw new ApiError(422,'افتح الإعدادات وأدخل مفتاح Gemini أو OpenRouter لتفعيل الذكاء الاصطناعي');
  const pin=process.env.NUR_ACCESS_TOKEN;
  if(!pin) throw new ApiError(503,'المفتاح المحفوظ على الخادم محمي. يلزم إعداد NUR_ACCESS_TOKEN');
  const got=String(req.headers['x-nur-access']||'');
  const x=Buffer.from(got),y=Buffer.from(pin);
  if(x.length!==y.length || !timingSafeEqual(x,y)) throw new ApiError(403,'رمز الدخول غير صحيح');
  return serverKey;
}
async function postJson(url, headers, payload){
  let response;
  try { response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(payload),signal:AbortSignal.timeout(50000)}); }
  catch(e){throw new ApiError(502,'تعذّر الاتصال بمزود الذكاء الاصطناعي. تحقق من اتصال الشبكة.');}
  let data;
  try{ data=await response.json(); }catch(e){ throw new ApiError(502,'استجابة غير مفهومة من مزود الذكاء الاصطناعي');}
  if(!response.ok){
    const message=String(data?.error?.message||data?.error||'عطل لدى مزود الخدمة').slice(0,250);
    throw new ApiError(response.status===429?429:502,'خطأ مزود AI: '+message);
  }
  return data;
}
export function geminiContents(messages) {
  return messages.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]}));
}
async function gemini(body,req,voice=false){
  const key=keyFor(body,'gemini',req);
  const model=safeModel(body.model,'gemini-2.5-flash');
  const conversation=validateMessages(body.messages);
  let contents=geminiContents(conversation);
  if(voice){
    const mime=String(body.mime||'').split(';')[0].toLowerCase();
    if(!TYPES.has(mime)) throw new ApiError(400,'صيغة الصوت غير مدعومة');
    if(typeof body.audio!=='string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.audio) || body.audio.length>4300000) throw new ApiError(413,'التسجيل كبير أو غير صالح');
    contents=contents.slice(0,-1);
    contents.push({role:'user',parts:[
      {text:'Listen carefully to this voice message. Reply ONLY as compact JSON with keys "transcript" (verbatim speech in its original language) and "reply" (your helpful response in the same language).'},
      {inlineData:{mimeType:mime,data:body.audio}}
    ]});
  }
  const payload={
    systemInstruction:{parts:[{text:SYSTEM}]},
    contents,
    generationConfig: voice ? {temperature:0.6,responseMimeType:'application/json'} : {temperature:0.7}
  };
  const data=await postJson('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{'x-goog-api-key':key},payload);
  const answer=(data.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('\n').trim();
  if(!answer) throw new ApiError(502,'لم يُرجع النموذج ردًا نصيًا');
  if(voice){
    try{
      const parsed=JSON.parse(answer);
      if(typeof parsed.reply==='string' && typeof parsed.transcript==='string'){
        return {reply:parsed.reply.trim(),transcript:parsed.transcript.trim(),provider:'gemini',model};
      }
    }catch(e){}
    return {reply:answer,transcript:'رسالة صوتية',provider:'gemini',model};
  }
  return {reply:answer,provider:'gemini',model};
}
async function openrouter(body,req){
  const key=keyFor(body,'openrouter',req);
  const model=safeModel(body.model,'openrouter/free');
  const messages=validateMessages(body.messages);
  const data=await postJson('https://openrouter.ai/api/v1/chat/completions',
    {Authorization:'Bearer '+key,'HTTP-Referer':'https://nur-voice-web.onrender.com','X-Title':'Nur Voice Web'},
    {model,temperature:0.65,max_tokens:1200,messages:[{role:'system',content:SYSTEM},...messages]});
  const reply=data.choices?.[0]?.message?.content;
  if(typeof reply !== 'string' || !reply.trim()) throw new ApiError(502,'لم يُرجع النموذج ردًا نصيًا');
  return {reply:reply.trim(),provider:'openrouter',model};
}
async function bodyJson(req,max){
  const chunks=[];let bytes=0;
  for await (const part of req){
    bytes+=part.length;
    if(bytes>max) throw new ApiError(413,'الطلب كبير جدًا');
    chunks.push(part);
  }
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch(e){throw new ApiError(400,'بيانات JSON غير صالحة')}
}
function send(res,status,data){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':'none'});
  res.end(JSON.stringify(data));
}
const limits=new Map();
function throttled(req){
  const who=req.socket.remoteAddress||'unknown';
  const now=Date.now();let x=limits.get(who);
  if(!x||now-x.t>60000)x={t:now,n:0};
  limits.set(who,x);
  if(limits.size>2000)limits.clear();
  x.n++;
  if(x.n>35)throw new ApiError(429,'طلبات كثيرة. حاول بعد قليل.');
}
export async function handler(req,res){
  try{
    const route=new URL(req.url,'http://localhost').pathname;
    if(req.method==='GET' && route==='/health') return send(res,200,{ok:true,app:'Nur Voice',configured:!!(process.env.NUR_GEMINI_KEY||process.env.NUR_OPENROUTER_KEY)});
    if(req.method==='GET' && (route==='/'||route==='/index.html')){
      const html=await readFile(join(here,'index.html'));
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
        'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
        'Permissions-Policy':'microphone=(self)',
        'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; media-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'"});
      return res.end(html);
    }
    if(req.method!=='POST'||!['/api/chat','/api/voice'].includes(route)) throw new ApiError(404,'الصفحة غير موجودة');
    const origin=req.headers.origin;
    if(origin){let host;try{host=new URL(origin).host}catch(e){throw new ApiError(403,'Origin غير صالح')}
      if(host!==req.headers.host)throw new ApiError(403,'غير مسموح بزيارة من موقع آخر');
    }
    throttled(req);
    if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new ApiError(415,'استخدم JSON');
    const body=await bodyJson(req,route==='/api/voice'?4700000:100000);
    if(!body||typeof body!=='object'||Array.isArray(body))throw new ApiError(400,'الطلب غير صالح');
    const provider=body.provider==='gemini'?'gemini':body.provider==='openrouter'?'openrouter':null;
    if(!provider)throw new ApiError(400,'حدد مزود الخدمة');
    if(route==='/api/voice' && provider!=='gemini')throw new ApiError(400,'تفريغ الصوت يحتاج Gemini. جرّب التعرّف الصوتي من المتصفح مع OpenRouter.');
    const answer=provider==='gemini'?await gemini(body,req,route==='/api/voice'):await openrouter(body,req);
    return send(res,200,answer);
  }catch(e){return send(res,e.status||500,{error:e.status?e.message:'خطأ غير متوقع في الخادم'});}
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]){
  const port=Number(process.env.PORT||10000);
  http.createServer(handler).listen(port,'0.0.0.0',()=>console.log('Nur Voice listening on '+port));
}
