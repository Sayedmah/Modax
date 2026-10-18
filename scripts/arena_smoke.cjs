const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true});const page=await browser.newPage();page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:8776');
  if(process.env.MODAX_QA_GUEST!=='true'){await page.locator('#username').fill('arena'+Date.now());await page.locator('#password').fill('qa-secure-password123');await page.locator('#register').click();}
  await page.locator('#app').waitFor({state:'visible'});await page.locator('[data-view=arena]').click();
  await page.locator('#dataset-name').fill('مجموعة خاصة');await page.locator('#dataset-cases').fill('[{"id":"one","task":"Return only MODAX","expected":"MODAX"}]');
  await page.locator('#dataset-save').click();await page.locator('#notice').filter({hasText:'حُفظت نسخة ثابتة'}).waitFor();
  const id=await page.locator('#arena-dataset').inputValue();if(!id)throw Error('Custom dataset not selected');
  const download=page.waitForEvent('download');await page.locator('#dataset-export').click();
  const data=JSON.parse(require('fs').readFileSync(await(await download).path(),'utf8'));
  if(data.version.length!==64||data.cases[0].expected!=='MODAX')throw Error('Dataset export invalid');
  await page.locator('#arena-models').selectOption('demo');await page.locator('#arena-form button').click();
  await page.locator('#arena-results pre').filter({hasText:data.version}).waitFor();
  const result=JSON.parse(await page.locator('#arena-results pre').first().textContent());
  if(result.results[0].score!==0||result.results[0].demo!==true)throw Error('Demo benchmark misrepresented');
  page.once('dialog',dialog=>dialog.accept());await page.locator('#dataset-delete').click();
  await page.locator('#notice').filter({hasText:'حُذفت المجموعة'}).waitFor();
  if(await page.locator('#arena-dataset').inputValue()!=='')throw Error('Deleted dataset selected');
  await page.reload();try{await page.locator('#app').waitFor({state:'visible'});}catch{throw Error('Reload failed: '+await page.locator('#boot-message').textContent());}await page.locator('[data-view=arena]').click();
  await page.locator('#arena-results pre').filter({hasText:data.version}).waitFor();
  if(await page.locator('#arena-dataset option').count()!==1)throw Error('Deleted dataset returned');
  await page.setViewportSize({width:390,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Arena mobile overflow');
  if(errors.length)throw Error(errors.join(';'));console.log(JSON.stringify({passed:true,checks:['custom dataset create/select','JSON export/version','demo run actual score','delete with retained snapshot','reload'],errors}));await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
