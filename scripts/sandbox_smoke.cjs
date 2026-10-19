const {chromium}=require('playwright');
const fs=require('fs');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8776');
  if(process.env.MODAX_QA_GUEST!=='true'){
    await page.locator('#username').fill('sandbox'+Date.now());await page.locator('#password').fill('test-secure-password123');await page.locator('#register').click();
  }
  await page.locator('#app').waitFor({state:'visible'});
  await page.locator('[data-view=sandbox]').click();
  await page.locator('#sandbox-status').filter({hasText:'غير متصل'}).waitFor();
  const source='import unittest\nclass Test(unittest.TestCase):\n def test_sum(self): self.assertEqual(2+2,4)\n';
  await page.locator('#sandbox-source').setInputFiles({name:'test_sum.py',mimeType:'text/x-python',buffer:Buffer.from(source)});
  await page.locator('#sandbox-consent').check();await page.locator('#sandbox-submit').click();
  await page.locator('#sandbox-result .task-status').filter({hasText:'BLOCKED'}).waitFor();
  const file=page.waitForEvent('download');await page.locator('#sandbox-result .artifact-download').click();
  if(fs.readFileSync(await(await file).path(),'utf8')!==source)throw Error('Source download changed');
  const report=page.waitForEvent('download');await page.locator('#sandbox-result .report-download').click();
  const result=JSON.parse(fs.readFileSync(await(await report).path(),'utf8'));
  if(result.state!=='BLOCKED'||result.result.model_called!==false)throw Error('False runtime success');
  await page.reload();await page.locator('#app').waitFor({state:'visible'});
  await page.locator('[data-view=tasks]').click();await page.locator('#task-history .report-download').waitFor();
  await page.locator('[data-view=sandbox]').click();await page.setViewportSize({width:320,height:900});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Mobile overflow');
  if(errors.length)throw Error(errors.join(';'));
  console.log(JSON.stringify({passed:true,checks:['honest unavailable state','source upload','source attachment bytes','downloadable blocked report','saved history','320px layout'],errors}));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
