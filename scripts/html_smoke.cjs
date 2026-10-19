const {chromium}=require('playwright');
const fs=require('fs');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8776');
  if(process.env.MODAX_QA_GUEST!=='true'){
    await page.locator('#username').fill('html'+Date.now());await page.locator('#password').fill('test-secure-password123');await page.locator('#register').click();
  }
  await page.locator('#app').waitFor({state:'visible'});
  await page.locator('#mode-x').click();await page.locator('#work-actions').waitFor({state:'visible'});
  await page.locator('#prompt').fill('Build an Arabic portfolio');await page.locator('#work-html').click();
  if(await page.locator('#html-goal').inputValue()!=='Build an Arabic portfolio')throw Error('HTML handoff missing');
  await page.locator('#html-model').selectOption('demo');await page.locator('#html-submit').click();
  await page.locator('#html-result .task-status').filter({hasText:'COMPLETED'}).waitFor();
  const downloaded=page.waitForEvent('download');await page.locator('#html-result .html-download').click();
  const file=await downloaded;if(file.suggestedFilename()!=='index.html')throw Error('Wrong filename');
  const source=fs.readFileSync(await file.path(),'utf8');
  if(!source.startsWith('<!doctype html>')||!source.includes('DEMO'))throw Error('HTML content missing');
  await page.reload();await page.locator('#app').waitFor({state:'visible'});
  await page.locator('[data-view=tasks]').click();await page.locator('#task-history .html-download').waitFor({state:'visible'});
  const restored=page.waitForEvent('download');await page.locator('#task-history .html-download').click();
  if(fs.readFileSync(await(await restored).path(),'utf8')!==source)throw Error('History download changed');
  await page.locator('[data-view=html]').click();await page.setViewportSize({width:320,height:900});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('HTML mobile overflow');
  if(errors.length)throw Error(errors.join(';'));
  console.log(JSON.stringify({passed:true,checks:['X HTML handoff','explicit DEMO generation','index.html download','persisted history download','320px layout'],errors}));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
