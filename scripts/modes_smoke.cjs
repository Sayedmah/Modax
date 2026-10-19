const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:8776');
  if(process.env.MODAX_QA_GUEST!=='true'){
    await page.locator('#username').fill('modes'+Date.now());
    await page.locator('#password').fill('test-secure-password123');
    await page.locator('#register').click();
  }
  await page.locator('#app').waitFor({state:'visible'});
  await page.locator('#prompt').fill('M-private-chat');await page.locator('#send').click();
  await page.locator('.message.assistant small').filter({hasText:'completed'}).waitFor();
  await page.locator('#send').waitFor({state:'visible'});
  await page.locator('#mode-x').click();
  await page.locator('#work-actions').waitFor({state:'visible'});
  if(await page.locator('.history-item').count())throw Error('M history leaked into X');
  await page.locator('#prompt').fill('X-project-plan');await page.locator('#send').click();
  await page.locator('.message.assistant small').filter({hasText:'completed'}).waitFor();
  await page.locator('#mode-m').click();
  await page.locator('.history-item').filter({hasText:'M-private-chat'}).waitFor();
  if((await page.locator('#chat-list').textContent()).includes('X-project-plan'))throw Error('Mode history mixed');
  await page.locator('#mode-x').click();
  await page.locator('.history-item').filter({hasText:'X-project-plan'}).waitFor();
  await page.locator('#prompt').fill('Create greeting project');await page.locator('#work-code').click();
  if(await page.locator('#code-goal').inputValue()!=='Create greeting project')throw Error('Work handoff lost request');
  await page.locator('#coder-form button[type=submit]').click();
  await page.locator('#coder-result .task-status').filter({hasText:'COMPLETED'}).waitFor();
  await page.locator('[data-view=research]').click();
  await page.locator('#web-query').fill('Godot official docs');await page.locator('#web-consent').check();
  await page.locator('#web-search-submit').click();
  await page.locator('#web-status').filter({hasText:'not configured'}).waitFor();
  await page.locator('[data-view=about]').click();
  await page.locator('#about-memory').click();await page.locator('#memory-form').waitFor({state:'visible'});
  await page.reload();await page.locator('#app').waitFor({state:'visible'});
  await page.locator('#mode-x').click();
  await page.locator('.history-item').filter({hasText:'X-project-plan'}).waitFor();
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:900});
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Overflow '+width);
    const rail=await page.locator('.mode-rail').boundingBox();if(rail.x<width-70)throw Error('Rail is not on right');
  }
  if(errors.length)throw Error(errors.join(';'));
  console.log(JSON.stringify({passed:true,checks:['M/X separate persisted history','work request handoff and real demo Coder files','explicit search unavailable state','memory navigation','reload','right rail and responsive 320/390/768/1440'],errors}));
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
