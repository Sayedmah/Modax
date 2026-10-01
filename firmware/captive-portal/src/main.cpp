#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>

const uint8_t BTN_UP=32, BTN_DOWN=33, BTN_LEFT=25, BTN_RIGHT=26, BTN_ACTION=27;
const uint8_t LED_RED=12, LED_GREEN=13, BUZZER=14;

const char* AP_SSID="MODY-ESP32";
const char* AP_PASSWORD=""; // ضع 8 أحرف أو أكثر لو أردت كلمة مرور

WebServer server(80);
DNSServer dns;
IPAddress apIP(192,168,4,1);
IPAddress mask(255,255,255,0);

bool redOn=false, greenOn=false;

const char PAGE[] PROGMEM = R"HTML(
<!doctype html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MODY ESP32</title>
<style>
body{font-family:system-ui;background:#0f172a;color:#fff;margin:0;padding:20px}
main{max-width:620px;margin:auto}.card{background:#1e293b;border-radius:18px;padding:18px;margin:14px 0}
button{padding:14px;border:0;border-radius:12px;margin:5px;font-size:16px}
.g{background:#22c55e}.r{background:#ef4444;color:#fff}.b{background:#38bdf8}.x{background:#475569;color:#fff}
.key{display:inline-block;padding:8px;margin:4px;border-radius:8px;background:#334155}.on{background:#f59e0b;color:#111827}
</style></head><body><main>
<div class="card"><h1>MODY ESP32</h1><p>Captive Portal بدون شاشة</p></div>
<div class="card"><h2>الأزرار</h2>
<span id="up" class="key">UP</span><span id="down" class="key">DOWN</span>
<span id="left" class="key">LEFT</span><span id="right" class="key">RIGHT</span>
<span id="action" class="key">ACTION</span></div>
<div class="card"><h2>التحكم</h2>
<button class="g" onclick="c('green-on')">Green ON</button><button class="x" onclick="c('green-off')">Green OFF</button>
<button class="r" onclick="c('red-on')">Red ON</button><button class="x" onclick="c('red-off')">Red OFF</button>
<button class="b" onclick="c('beep')">Buzzer</button><button class="x" onclick="c('all-off')">All OFF</button></div>
</main><script>
function k(id,v){document.getElementById(id).classList.toggle('on',!!v)}
async function s(){try{let r=await fetch('/api/status?t='+Date.now());let j=await r.json();k('up',j.up);k('down',j.down);k('left',j.left);k('right',j.right);k('action',j.action)}catch(e){}}
async function c(x){await fetch('/api/cmd?x='+x);s()} setInterval(s,500);s();
</script></body></html>
)HTML";

void leds(){ digitalWrite(LED_RED,redOn); digitalWrite(LED_GREEN,greenOn); }
bool pressed(uint8_t p){ return digitalRead(p)==LOW; }

void root(){ server.send_P(200,"text/html; charset=utf-8",PAGE); }
void statusJson(){
  String j="{";
  j+="\"up\":"+String(pressed(BTN_UP)?"true":"false");
  j+=",\"down\":"+String(pressed(BTN_DOWN)?"true":"false");
  j+=",\"left\":"+String(pressed(BTN_LEFT)?"true":"false");
  j+=",\"right\":"+String(pressed(BTN_RIGHT)?"true":"false");
  j+=",\"action\":"+String(pressed(BTN_ACTION)?"true":"false");
  j+="}";
  server.send(200,"application/json",j);
}
void cmd(){
  String x=server.arg("x");
  if(x=="green-on")greenOn=true;
  else if(x=="green-off")greenOn=false;
  else if(x=="red-on")redOn=true;
  else if(x=="red-off")redOn=false;
  else if(x=="beep")tone(BUZZER,1800,100);
  else if(x=="all-off"){redOn=false;greenOn=false;noTone(BUZZER);}
  leds(); statusJson();
}

void setup(){
  Serial.begin(115200);
  pinMode(BTN_UP,INPUT_PULLUP);pinMode(BTN_DOWN,INPUT_PULLUP);pinMode(BTN_LEFT,INPUT_PULLUP);
  pinMode(BTN_RIGHT,INPUT_PULLUP);pinMode(BTN_ACTION,INPUT_PULLUP);
  pinMode(LED_RED,OUTPUT);pinMode(LED_GREEN,OUTPUT);pinMode(BUZZER,OUTPUT);
  leds();

  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(apIP,apIP,mask);
  if(strlen(AP_PASSWORD)>=8) WiFi.softAP(AP_SSID,AP_PASSWORD);
  else WiFi.softAP(AP_SSID);

  dns.start(53,"*",apIP);
  server.on("/",root);
  server.on("/api/status",statusJson);
  server.on("/api/cmd",cmd);
  server.on("/generate_204",root);
  server.on("/hotspot-detect.html",root);
  server.on("/connecttest.txt",root);
  server.onNotFound(root);
  server.begin();
}

void loop(){
  dns.processNextRequest();
  server.handleClient();

  static bool last[5]={};
  const uint8_t pins[5]={BTN_UP,BTN_DOWN,BTN_LEFT,BTN_RIGHT,BTN_ACTION};
  for(int i=0;i<5;i++){
    bool p=pressed(pins[i]);
    if(p&&!last[i]){
      if(i==0)greenOn=true;
      if(i==1)greenOn=false;
      if(i==2)redOn=true;
      if(i==3)redOn=false;
      if(i==4)tone(BUZZER,2200,100);
      leds();
    }
    last[i]=p;
  }
  delay(2);
}
