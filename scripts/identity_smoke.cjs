const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8776');
  if(process.env.MODAX_QA_GUEST!=='true'){
    await page.locator('#username').fill('identity'+Date.now());
    await page.locator('#password').fill('test-secure-password123');
    await page.locator('#register').click();
  }
  await page.locator('#app').waitFor({state:'visible'});
  await page.locator('#quick-start').waitFor({state:'visible'});
  if(!await page.locator('#quick-start img').evaluate(e=>e.complete&&e.naturalWidth>0))throw Error('Logo failed to load');
  await page.locator('[data-quick-view=html]').click();
  if(!await page.locator('#html-goal').inputValue())throw Error('HTML starter did not fill goal');
  await page.locator('.nav[data-view=chat]').click();
  await page.locator('[data-quick-view=chat]').click();
  await page.locator('#prompt').press('Control+Enter');
  await page.locator('.message.assistant small').filter({hasText:'completed'}).waitFor();
  if(!await page.locator('.model-badge').last().textContent().then(t=>t.includes('deterministic-test-adapter')&&t.includes('محاكاة')))throw Error('Streaming demo identity missing');
  if(await page.locator('#quick-start').isVisible())throw Error('Starter overlaps conversation');
  await page.reload();await page.locator('#app').waitFor({state:'visible'});
  await page.locator('.history-item').first().click();
  if(!await page.locator('.model-badge').last().textContent().then(t=>t.includes('deterministic-test-adapter')))throw Error('History lost model identity');
  await page.route('**/api/v1/chats/*/messages',route=>route.fulfill({status:200,contentType:'text/event-stream',body:'event: start\ndata: {"configured_model":"openrouter/free","provider":"openrouter","demo":false}\n\nevent: delta\ndata: {"text":"Router response"}\n\nevent: done\ndata: {"configured_model":"openrouter/free","reported_model":"vendor/actual-model-v2","provider":"openrouter","status":"completed"}\n\n'}));
  await page.locator('#prompt').fill('Identity protocol fixture');await page.locator('#send').click();
  await page.locator('.model-badge').last().filter({hasText:'vendor/actual-model-v2'}).waitFor();
  for(const width of [320,768,1024,1440]){
    await page.setViewportSize({width,height:960});
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Overflow at '+width);
  }
  await page.screenshot({path:process.env.MODAX_QA_DIR+'/identity-chat.png',fullPage:true});
  console.log(JSON.stringify({passed:true,checks:['logo','HTML starter','keyboard send','stream model','history model','reported router model','four responsive widths'],errors}));
  await browser.close();if(errors.length)process.exit(1);
})().catch(e=>{console.error(e);process.exit(1);});
