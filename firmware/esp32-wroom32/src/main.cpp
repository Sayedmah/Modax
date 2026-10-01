#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <Update.h>

static WebServer server(80);
static DNSServer dns;
static Preferences prefs;
static bool portalMode = true;
static bool staConnected = false;
static String deviceId;
static String apName;
static unsigned long bootPressedAt = 0;
static bool otaFailed = false;
static size_t otaBytes = 0;

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

static String pageHead(const String &title){
  return String("<!doctype html><html lang='ar' dir='rtl'><meta charset='utf-8'>"
    "<meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>")+title+"</title><style>"
    "body{font-family:system-ui;background:#0b0e12;color:#fff;margin:0;padding:18px}"
    "main{max-width:680px;margin:auto}.card{background:#151b24;border:1px solid #2d3746;border-radius:18px;padding:18px;margin:12px 0}"
    "input,button,select{font:inherit;width:100%;padding:12px;margin:7px 0;border-radius:12px;border:1px solid #455268;background:#0d1219;color:#fff;box-sizing:border-box}"
    "button,.button{display:block;background:#1769e0;color:white;text-decoration:none;text-align:center;padding:12px;border-radius:12px;border:0}"
    ".danger{background:#963342}.muted{color:#aab5c4;line-height:1.7}.ok{color:#7fe29a}.warn{color:#ffd27d}"
    "</style><main>";
}

static String setupPage(){
  String h = pageHead("MODAX Setup");
  h += "<section class='card'><h1>MODAX — ESP32-WROOM-32</h1>"
       "<p class='muted'>إعداد Wi-Fi + تحديث OTA من iPhone/Android. لو شبكتك مخفية اكتب SSID يدويًا.</p>"
       "<label style='display:flex;gap:10px;align-items:center'><input id='hidden' type='checkbox' style='width:auto'> شبكتي مخفية</label>"
       "<div id='scanbox'><button onclick='scan()'>بحث عن الشبكات الظاهرة</button><select id='nets'><option>اضغط بحث</option></select></div>"
       "<input id='ssid' placeholder='اسم الشبكة SSID'><input id='pass' type='password' placeholder='كلمة المرور'>"
       "<button onclick='save()'>حفظ والاتصال</button><pre id='out'></pre>"
       "<p class='muted'>ESP32-WROOM-32 يدعم Wi-Fi ‏2.4GHz فقط.</p></section>";
  h += "<section class='card'><h2>تثبيت مشروع / Firmware من iPhone</h2>"
       "<p class='muted'>اختر ملف <strong>.bin</strong> من تطبيق Files ثم اضغط تثبيت. هذه الصفحة تعمل من Chrome على iPhone لأنها ترسل الملف عبر Wi-Fi وليس USB.</p>"
       "<a class='button' href='/ota'>فتح صفحة التحديث OTA</a>"
       "<p class='warn'>استخدم ملف OTA المخصص للتطبيق، وليس Full Flash BIN.</p></section>";
  h += "<section class='card'><p class='muted'>لإعادة إعداد Wi-Fi: اضغط BOOT لمدة 3 ثوانٍ أثناء التشغيل.</p></section>";
  h += "<script>"
       "const n=document.getElementById('nets'),s=document.getElementById('ssid'),p=document.getElementById('pass'),o=document.getElementById('out'),x=document.getElementById('hidden'),b=document.getElementById('scanbox');"
       "x.onchange=()=>{b.style.display=x.checked?'none':'block';if(x.checked){s.value='';s.focus();o.textContent='اكتب SSID المخفي يدويًا'}};"
       "async function scan(){o.textContent='جاري البحث...';let r=await fetch('/api/scan');let j=await r.json();n.innerHTML='';j.networks.forEach(v=>{let q=document.createElement('option');q.value=v.ssid;q.textContent=v.ssid+' ('+v.rssi+' dBm)';n.appendChild(q)});if(j.networks[0]){s.value=j.networks[0].ssid}o.textContent='تم العثور على '+j.networks.length+' شبكة ظاهرة'}"
       "n.onchange=()=>{if(!x.checked)s.value=n.value};"
       "async function save(){let ss=s.value.trim();if(!ss){o.textContent='اكتب اسم الشبكة';return}o.textContent='جاري الحفظ...';let q=new URLSearchParams({ssid:ss,password:p.value,hidden:x.checked?'1':'0'});let r=await fetch('/save',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:q});o.textContent=await r.text()}"
       "</script></main></html>";
  return h;
}

static String otaPage(){
  String h = pageHead("MODAX OTA");
  h += "<section class='card'><h1>تثبيت MODAX / مشروع BIN</h1>"
       "<p class='muted'>متوافق مع iPhone/iPad وAndroid. اختر ملف Firmware <strong>.bin</strong> من Files ثم ثبته لاسلكيًا.</p>"
       "<form method='POST' action='/update' enctype='multipart/form-data'>"
       "<input type='file' name='firmware' accept='.bin,application/octet-stream' required>"
       "<button class='danger' type='submit'>تثبيت على ESP32</button></form>"
       "<p class='warn'>لا تفصل الكهرباء أثناء التحديث. عند النجاح ستعيد البورد التشغيل تلقائيًا.</p>"
       "<a class='button' href='/'>رجوع</a></section></main></html>";
  return h;
}

static void captivePage(){
  server.send(200,"text/html; charset=utf-8",setupPage());
}

static void installRoutes(){
  server.on("/", HTTP_GET, [](){
    server.send(200,"text/html; charset=utf-8",setupPage());
  });

  server.on("/ota", HTTP_GET, [](){
    server.send(200,"text/html; charset=utf-8",otaPage());
  });

  server.on("/api/info", HTTP_GET, [](){
    String body = "{";
    body += "\"device_id\":\""+jsonEscape(deviceId)+"\",";
    body += "\"board_profile\":\"esp32-wroom-32-devkit-30pin\",";
    body += "\"chip_family\":\"ESP32\",";
    body += "\"mode\":\"ap_sta\",";
    body += "\"ap_ip\":\"192.168.4.1\",";
    body += "\"sta_connected\":"+String(staConnected?"true":"false")+",";
    body += "\"sta_ip\":\""+String(staConnected?WiFi.localIP().toString():"")+"\",";
    body += "\"ota\":true,\"phone_is_ui\":true";
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
    server.send(200,"text/plain; charset=utf-8","تم الحفظ. ستعيد البورد التشغيل وتحاول الاتصال.");
    delay(700);
    ESP.restart();
  });

  server.on("/update", HTTP_POST,
    [](){
      bool ok = !otaFailed && !Update.hasError() && otaBytes > 0;
      server.sendHeader("Connection","close");
      if(ok){
        server.send(200,"text/html; charset=utf-8",
          "<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width'>"
          "<body style='font-family:system-ui;background:#101318;color:white;padding:24px;text-align:center'>"
          "<h1>تم التثبيت ✅</h1><p>ESP32 ستعيد التشغيل الآن.</p></body>");
        delay(900);
        ESP.restart();
      }else{
        server.send(500,"text/html; charset=utf-8",
          "<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width'>"
          "<body style='font-family:system-ui;background:#101318;color:white;padding:24px;text-align:center'>"
          "<h1>فشل التحديث</h1><p>تأكد أنك اخترت OTA .bin صحيح ومخصص لـESP32-WROOM-32.</p>"
          "<a style='color:#7fc1ff' href='/ota'>حاول مرة أخرى</a></body>");
      }
    },
    [](){
      HTTPUpload& upload = server.upload();
      if(upload.status == UPLOAD_FILE_START){
        otaFailed=false;
        otaBytes=0;
        String name=upload.filename;
        name.toLowerCase();
        if(!name.endsWith(".bin")){
          otaFailed=true;
          return;
        }
        if(!Update.begin(UPDATE_SIZE_UNKNOWN)){
          otaFailed=true;
          Update.printError(Serial);
        }else{
          Serial.printf("OTA start: %s\n",upload.filename.c_str());
        }
      }else if(upload.status == UPLOAD_FILE_WRITE){
        if(!otaFailed){
          size_t written=Update.write(upload.buf,upload.currentSize);
          otaBytes += written;
          if(written != upload.currentSize){
            otaFailed=true;
            Update.printError(Serial);
          }
        }
      }else if(upload.status == UPLOAD_FILE_END){
        if(!otaFailed){
          if(!Update.end(true)){
            otaFailed=true;
            Update.printError(Serial);
          }else{
            Serial.printf("OTA complete: %u bytes\n",(unsigned)otaBytes);
          }
        }
      }else if(upload.status == UPLOAD_FILE_ABORTED){
        otaFailed=true;
        Update.abort();
        Serial.println("OTA aborted");
      }
    }
  );

  // Captive portal probes: Android / ChromeOS / Apple / Windows
  server.on("/generate_204", HTTP_GET, captivePage);
  server.on("/gen_204", HTTP_GET, captivePage);
  server.on("/connectivity-check.html", HTTP_GET, captivePage);
  server.on("/redirect", HTTP_GET, captivePage);
  server.on("/hotspot-detect.html", HTTP_GET, captivePage);
  server.on("/library/test/success.html", HTTP_GET, captivePage);
  server.on("/canonical.html", HTTP_GET, captivePage);
  server.on("/success.txt", HTTP_GET, captivePage);
  server.on("/connecttest.txt", HTTP_GET, captivePage);
  server.on("/ncsi.txt", HTTP_GET, captivePage);
  // Any unknown HTTP request is treated as a captive-portal request.
  server.onNotFound(captivePage);
}

static void startPortal(){
  portalMode=true;
  WiFi.mode(WIFI_AP_STA);
  WiFi.setSleep(false);
  delay(150);

  IPAddress apIP(192,168,4,1);
  IPAddress gateway(192,168,4,1);
  IPAddress subnet(255,255,255,0);
  WiFi.softAPConfig(apIP,gateway,subnet);

  bool apOk=WiFi.softAP(apName.c_str(),"modax1234",6,false,4);
  delay(100);
  dns.start(53,"*",apIP);
  Serial.printf("Captive portal AP: %s (%s) http://192.168.4.1\n",
                apName.c_str(),apOk?"started":"FAILED");
}

static bool connectSaved(){
  prefs.begin("modax",true);
  String ssid=prefs.getString("ssid","");
  String pass=prefs.getString("pass","");
  bool hidden=prefs.getBool("hidden",false);
  prefs.end();
  if(ssid.length()==0) return false;

  // Keep the MODAX access point alive while connecting to the router.
  WiFi.mode(WIFI_AP_STA);
  WiFi.setSleep(false);
  WiFi.begin(ssid.c_str(),pass.c_str(),0,nullptr,true);
  Serial.printf("Connecting to %s%s",ssid.c_str(),hidden?" (hidden)":"");
  unsigned long start=millis();
  while(WiFi.status()!=WL_CONNECTED && millis()-start<30000){
    delay(300); Serial.print(".");
  }
  Serial.println();
  if(WiFi.status()==WL_CONNECTED){
    staConnected=true;
    Serial.print("STA connected, IP: "); Serial.println(WiFi.localIP());
    Serial.printf("MODAX AP remains active: %s at 192.168.4.1\n",apName.c_str());
    return true;
  }
  staConnected=false;
  // Stop only the STA connection; keep the AP and captive portal running.
  WiFi.disconnect(false,false);
  Serial.println("STA not connected; MODAX AP remains active.");
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

  // Start the MODAX AP first and keep it available permanently.
  startPortal();

  // Then try the saved router credentials without shutting down the AP.
  connectSaved();

  server.begin();
  Serial.printf("MODAX ready: %s\n",deviceId.c_str());
}

void loop(){
  server.handleClient();
  // Wildcard DNS must keep running even when STA is connected.
  dns.processNextRequest();

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
