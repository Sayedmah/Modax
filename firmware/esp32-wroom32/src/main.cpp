#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>

static WebServer server(80);
static DNSServer dns;
static Preferences prefs;
static bool portalMode = false;
static String deviceId;
static String apName;
static unsigned long bootPressedAt = 0;

static String htmlEscape(const String &s){
  String o;
  for(char c: s){
    if(c=='&') o+="&amp;";
    else if(c=='<') o+="&lt;";
    else if(c=='>') o+="&gt;";
    else if(c=='\"') o+="&quot;";
    else o+=c;
  }
  return o;
}

static String jsonEscape(const String &s){
  String o;
  for(char c: s){
    if(c=='\\' || c=='\"'){ o+='\\'; o+=c; }
    else if(c=='\n') o+="\\n";
    else if(c=='\r') o+="\\r";
    else if((uint8_t)c >= 0x20) o+=c;
  }
  return o;
}

static String setupPage(){
  return String(
    "<!doctype html><html lang='ar' dir='rtl'><meta charset='utf-8'>"
    "<meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>MODAX Setup</title><style>"
    "body{font-family:system-ui;background:#0b0e12;color:#fff;margin:0;padding:20px}"
    "main{max-width:620px;margin:auto;background:#151b24;border:1px solid #2d3746;border-radius:20px;padding:20px}"
    "input,button,select{font:inherit;width:100%;padding:12px;margin:7px 0;border-radius:12px;border:1px solid #455268;background:#0d1219;color:#fff;box-sizing:border-box}"
    "button{background:#1769e0}.muted{color:#aab5c4;line-height:1.7}</style><main>"
    "<h1>MODAX — ESP32-WROOM-32</h1>"
    "<p class='muted'>اختر شبكة ظاهرة، أو فعّل «شبكة مخفية» واكتب اسم SSID يدويًا بالضبط كما هو في الراوتر.</p>"
    "<label style='display:flex;gap:10px;align-items:center;margin:10px 0'><input id='hidden' type='checkbox' style='width:auto'> شبكتي مخفية</label>"
    "<div id='scanbox'><button onclick='scan()'>بحث عن الشبكات الظاهرة</button><select id='nets'><option>اضغط بحث</option></select></div>"
    "<input id='ssid' placeholder='اسم الشبكة SSID — اكتب الاسم يدويًا لو الشبكة مخفية'>"
    "<input id='pass' type='password' placeholder='كلمة المرور'>"
    "<button onclick='save()'>حفظ والاتصال</button><pre id='out'></pre>"
    "<p class='muted'>للشبكة المخفية: لا تنتظر ظهورها في البحث. اكتب الاسم بنفس الحروف والمسافات ثم كلمة المرور. ESP32 يعمل على 2.4 GHz فقط.</p>"
    "<p class='muted'>لإعادة الإعداد لاحقًا: اضغط BOOT لمدة 3 ثوانٍ أثناء التشغيل.</p>"
    "<script>"
    "const n=document.getElementById('nets'),s=document.getElementById('ssid'),p=document.getElementById('pass'),o=document.getElementById('out'),h=document.getElementById('hidden'),b=document.getElementById('scanbox');"
    "h.onchange=()=>{b.style.display=h.checked?'none':'block';if(h.checked){n.selectedIndex=-1;s.value='';s.focus();o.textContent='اكتب اسم الشبكة المخفية يدويًا بالضبط.'}};"
    "async function scan(){o.textContent='جاري البحث...';let r=await fetch('/api/scan');let j=await r.json();n.innerHTML='';j.networks.forEach(x=>{let q=document.createElement('option');q.value=x.ssid;q.textContent=x.ssid+' ('+x.rssi+' dBm)';n.appendChild(q)});if(j.networks[0]){n.selectedIndex=0;s.value=j.networks[0].ssid}o.textContent='تم العثور على '+j.networks.length+' شبكة ظاهرة. لو شبكتك مخفية فعّل الخيار بالأعلى.'}"
    "n.onchange=()=>{if(!h.checked)s.value=n.value};"
    "async function save(){let ss=s.value.trim();if(!ss){o.textContent='اكتب اسم الشبكة SSID';return}o.textContent=h.checked?'جاري حفظ الشبكة المخفية والاتصال...':'جاري الحفظ والاتصال...';let q=new URLSearchParams({ssid:ss,password:p.value,hidden:h.checked?'1':'0'});let r=await fetch('/save',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:q});o.textContent=await r.text()}"
    "</script></main></html>"
  );
}

static void redirectPortal(){
  // Captive portals are more reliable on Android/iOS when the probe itself
  // receives the login page instead of a redirect loop.
  server.send(200,"text/html; charset=utf-8",setupPage());
}

static void installRoutes(){
  server.on("/", HTTP_GET, [](){
    if(portalMode) server.send(200,"text/html; charset=utf-8",setupPage());
    else server.send(200,"text/html; charset=utf-8","<h1>MODAX ESP32</h1><p>Connected. Open /api/info for device status.</p>");
  });

  server.on("/api/info", HTTP_GET, [](){
    String ip = portalMode ? "192.168.4.1" : WiFi.localIP().toString();
    String body = "{";
    body += "\"device_id\":\""+jsonEscape(deviceId)+"\",";
    body += "\"board_profile\":\"esp32-wroom-32-devkit-30pin\",";
    body += "\"chip_family\":\"ESP32\",";
    body += "\"mode\":\""+String(portalMode?"setup_ap":"wifi_sta")+"\",";
    body += "\"ip\":\""+ip+"\",";
    body += "\"has_display\":false,\"has_camera\":false,\"has_microphone\":false,\"has_speaker\":false,\"phone_is_ui\":true";
    body += "}";
    server.send(200,"application/json",body);
  });

  server.on("/api/scan", HTTP_GET, [](){
    int n = WiFi.scanNetworks(false,true);
    String body = "{\"networks\":[";
    bool first=true;
    for(int i=0;i<n && i<30;i++){
      if(WiFi.SSID(i).length()==0) continue;
      if(!first) body+=",";
      first=false;
      body += "{\"ssid\":\""+jsonEscape(WiFi.SSID(i))+"\",\"rssi\":"+String(WiFi.RSSI(i))+"}";
    }
    body += "]}";
    WiFi.scanDelete();
    server.send(200,"application/json",body);
  });

  server.on("/save", HTTP_POST, [](){
    String ssid=server.arg("ssid");
    String pass=server.arg("password");
    bool hidden=server.arg("hidden")=="1";
    ssid.trim();
    if(ssid.length()<1 || ssid.length()>32 || pass.length()>63){
      server.send(400,"text/plain; charset=utf-8","بيانات الشبكة غير صحيحة");
      return;
    }
    prefs.begin("modax",false);
    prefs.putString("ssid",ssid);
    prefs.putString("pass",pass);
    prefs.putBool("hidden",hidden);
    prefs.end();
    server.send(200,"text/plain; charset=utf-8",hidden ? "تم حفظ الشبكة المخفية. البورد ستعيد التشغيل وتحاول الاتصال خلال 30 ثانية." : "تم الحفظ. البورد ستعيد التشغيل الآن.");
    delay(700);
    ESP.restart();
  });

  // Android / ChromeOS
  server.on("/generate_204", HTTP_GET, redirectPortal);
  server.on("/gen_204", HTTP_GET, redirectPortal);
  server.on("/connectivity-check.html", HTTP_GET, redirectPortal);
  server.on("/redirect", HTTP_GET, redirectPortal);
  // Apple captive-network assistant
  server.on("/hotspot-detect.html", HTTP_GET, redirectPortal);
  server.on("/library/test/success.html", HTTP_GET, redirectPortal);
  server.on("/canonical.html", HTTP_GET, redirectPortal);
  server.on("/success.txt", HTTP_GET, redirectPortal);
  // Windows NCSI
  server.on("/connecttest.txt", HTTP_GET, redirectPortal);
  server.on("/ncsi.txt", HTTP_GET, redirectPortal);
  server.onNotFound([](){ if(portalMode) redirectPortal(); else server.send(404,"text/plain","not found"); });
}

static void startPortal(){
  portalMode=true;
  WiFi.disconnect(true, true);
  delay(150);
  WiFi.mode(WIFI_AP_STA);
  WiFi.setSleep(false);

  IPAddress apIP(192,168,4,1);
  IPAddress gateway(192,168,4,1);
  IPAddress subnet(255,255,255,0);
  WiFi.softAPConfig(apIP,gateway,subnet);

  bool apOk=WiFi.softAP(apName.c_str(),"modax1234",6,false,4);
  delay(100);
  dns.start(53,"*",apIP);

  Serial.printf("Captive portal AP: %s (%s) URL: http://192.168.4.1\n",
                apName.c_str(),apOk?"started":"FAILED");
}

static bool connectSaved(){
  prefs.begin("modax",true);
  String ssid=prefs.getString("ssid","");
  String pass=prefs.getString("pass","");
  bool hidden=prefs.getBool("hidden",false);
  prefs.end();
  if(ssid.length()==0) return false;

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(ssid.c_str(),pass.c_str(),0,nullptr,true);
  Serial.printf("Connecting to %s%s",ssid.c_str(),hidden?" (hidden)":"");
  unsigned long start=millis();
  while(WiFi.status()!=WL_CONNECTED && millis()-start<30000){
    delay(300); Serial.print(".");
  }
  Serial.println();
  if(WiFi.status()==WL_CONNECTED){
    portalMode=false;
    Serial.print("Connected, IP: "); Serial.println(WiFi.localIP());
    return true;
  }
  WiFi.disconnect(true);
  return false;
}

static void makeId(){
  uint64_t mac=ESP.getEfuseMac();
  uint16_t tail=(uint16_t)(mac & 0xFFFF);
  char d[24],a[24];
  snprintf(d,sizeof(d),"modax-%04x",tail);
  snprintf(a,sizeof(a),"MODAX-%04X",tail);
  deviceId=d; apName=a;
}

void setup(){
  Serial.begin(115200);
  delay(250);
  pinMode(0,INPUT_PULLUP);
  makeId();
  installRoutes();
  if(!connectSaved()) startPortal();
  server.begin();
  Serial.printf("MODAX ready: %s\n",deviceId.c_str());
}

void loop(){
  server.handleClient();
  if(portalMode) dns.processNextRequest();

  bool pressed=digitalRead(0)==LOW;
  if(pressed && bootPressedAt==0) bootPressedAt=millis();
  if(!pressed) bootPressedAt=0;
  if(pressed && bootPressedAt && millis()-bootPressedAt>=3000){
    prefs.begin("modax",false);
    prefs.clear();
    prefs.end();
    Serial.println("Wi-Fi settings cleared.");
    delay(300);
    ESP.restart();
  }
  delay(2);
}
