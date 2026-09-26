import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

const PAIR_PIN=String(process.env.MODAX_PAIR_PIN||'').trim();
const MAX_CLIENTS=Math.max(1,Number(process.env.MODAX_MAX_CLIENTS||2));
const clients=new Set();

const id=()=>crypto.randomUUID();
const packet=(line)=>({
  header:{version:1,requestId:id(),messageType:'commandRequest',messagePurpose:'commandRequest'},
  body:{version:1,commandLine:line,origin:{type:'player'}}
});
const say=(ws,text)=>{
  if(ws.readyState!==WebSocket.OPEN)return;
  const raw=JSON.stringify({rawtext:[{text:'§b[MODAX]§r '+String(text).slice(0,600)}]});
  ws.send(JSON.stringify(packet('tellraw @a '+raw)));
};
const subscribe=(ws)=>{
  ws.send(JSON.stringify({
    header:{version:1,requestId:id(),messageType:'commandRequest',messagePurpose:'subscribe'},
    body:{eventName:'PlayerMessage'}
  }));
};
function extract(data){
  let p;try{p=JSON.parse(data.toString('utf8'));}catch{return null;}
  const b=p?.body||{},x=b.properties||b;
  const m=x.Message??x.message??b.Message??b.message;
  const s=x.Sender??x.sender??b.Sender??b.sender??'Player';
  if(typeof m!=='string')return null;
  return {sender:String(s).slice(0,64),message:m.slice(0,1000)};
}
function parse(message){
  const m=String(message).trim().match(/^(?:modax|موداكس)\s*[:,\-]?\s*(.*)$/iu);
  return m?m[1].trim():null;
}
function command(ws,sender,c){
  const x=c.toLocaleLowerCase('en-US');
  if(!x||x==='help'||x==='مساعدة')return say(ws,'أوامر: MODAX ping | MODAX انهي اللعبة | MODAX boss status');
  if(x==='ping'||x==='اختبار')return say(ws,'PONG ✅ الاتصال يعمل يا '+sender);
  if(['finish game','beat game','boss run','all bosses','انهي اللعبة','انه اللعبة','خلص اللعبة','كل البوسات'].includes(x)){
    ws.goal={type:'full_game_boss_run',stage:0,status:'queued',owner:sender,startedAt:Date.now()};
    return say(ws,'FULL GAME + ALL BOSSES 🐉 تم تسجيل المهمة.');
  }
  if(x==='boss status'||x==='حالة البوسات'||x==='حالة المهمة'){
    return say(ws,ws.goal?'Boss Run: '+ws.goal.status+' | المرحلة '+(ws.goal.stage+1):'لا توجد Boss Run نشطة.');
  }
  if(x==='boss cancel'||x==='الغاء المهمة'||x==='إلغاء المهمة'){
    ws.goal=null;return say(ws,'تم إلغاء المهمة.');
  }
  return say(ws,'وصلني الأمر ✅');
}

export function attachBedrockBridge(server){
  const wss=new WebSocketServer({noServer:true,maxPayload:65536,perMessageDeflate:false});

  server.on('upgrade',(req,socket,head)=>{
    let path='/';try{path=new URL(req.url||'/','http://localhost').pathname;}catch{}
    if(path!=='/'&&path!=='/m')return socket.destroy();
    if(clients.size>=MAX_CLIENTS){socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');return socket.destroy();}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });

  wss.on('connection',ws=>{
    clients.add(ws);ws.isAlive=true;ws.paired=!PAIR_PIN;
    ws.on('pong',()=>ws.isAlive=true);
    subscribe(ws);
    setTimeout(()=>say(ws,PAIR_PIN?'CONNECTED 🔒 اكتب: MODAX <PIN>':'CONNECTED ✅ اكتب: MODAX ping'),250);

    ws.on('message',data=>{
      const msg=extract(data);if(!msg)return;
      const c=parse(msg.message);if(c===null)return;
      if(!ws.paired){
        if(c===PAIR_PIN){ws.paired=true;say(ws,'PAIRED ✅ اكتب: MODAX ping');}
        else say(ws,'PAIR REQUIRED 🔒');
        return;
      }
      command(ws,msg.sender,c);
    });
    ws.on('close',()=>clients.delete(ws));
    ws.on('error',()=>clients.delete(ws));
  });

  const timer=setInterval(()=>{
    for(const ws of clients){
      if(ws.isAlive===false){clients.delete(ws);ws.terminate();continue;}
      ws.isAlive=false;ws.ping();
    }
  },30000);
  timer.unref?.();

  return {wss,clients};
}
