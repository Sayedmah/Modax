const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  async function enter(label){
    await page.goto('http://127.0.0.1:8776');
    if(process.env.MODAX_QA_GUEST!=='true'){
      await page.locator('#auth').waitFor({state:'visible'});
      await page.locator('#username').fill(label+Date.now());
      await page.locator('#password').fill('qa-secure-password123');
      await page.locator('#register').click();
    }
    await page.locator('#app').waitFor({state:'visible'});
  }
  await enter('notes');
  await page.locator('[data-view=memory]').click();
  await page.locator('#memory-text').fill('تفضيل عربي\n<script>not executable</script>');
  await page.locator('#memory-form button').click();
  await page.locator('#memory-list p').filter({hasText:'تفضيل عربي'}).waitFor();
  await page.locator('#connect-api').click();
  // Source settings must never be copied to the new owner.
  await page.locator('#use-memory').check();
  await page.locator('#preferences-form button').click();
  await page.locator('#notice').filter({hasText:'حُفظت التفضيلات'}).waitFor();
  const download=page.waitForEvent('download');await page.locator('#account-export').click();
  const path=await(await download).path();
  await page.locator('#confirm-note-restore').check();
  const priorToken=await page.evaluate(()=>sessionStorage.getItem('modax-token'));
  await page.locator('#logout').click();
  if(process.env.MODAX_QA_GUEST==='true'){
    await page.waitForFunction(old=>{const token=sessionStorage.getItem('modax-token');return token&&token!==old;},priorToken);
    await page.locator('#app').waitFor({state:'visible'});
  }else {
    // Wait for logout to revoke/remove the token before navigation can cancel it.
    await page.locator('#auth').waitFor({state:'visible'});
    await enter('target');
  }
  await page.locator('#connect-api').click();
  if(await page.locator('#confirm-note-restore').isChecked())throw Error('Consent leaked between sessions');
  if(!await page.locator('#restore-notes').isDisabled())throw Error('Restore enabled without consent');
  if(await page.locator('#use-memory').isChecked())throw Error('Memory leaked between sessions');
  await page.locator('#confirm-note-restore').check();
  const chooser=page.waitForEvent('filechooser');await page.locator('#restore-notes').click();
  await(await chooser).setFiles(path);
  await page.locator('#notice').filter({hasText:'تمت استعادة 1 ملاحظة'}).waitFor();
  if(await page.locator('#confirm-note-restore').isChecked())throw Error('Consent not reset after import');
  if(!await page.locator('#restore-notes').isDisabled())throw Error('Repeated restore not gated');
  if(await page.locator('#use-memory').isChecked())throw Error('Restore enabled memory');
  await page.locator('[data-view=memory]').click();
  await page.locator('#memory-list p').filter({hasText:'<script>not executable</script>'}).waitFor();
  if(await page.locator('#memory-list script').count())throw Error('Imported content executed');
  await page.reload();await page.locator('#app').waitFor({state:'visible'});
  await page.locator('[data-view=memory]').click();
  await page.locator('#memory-list p').filter({hasText:'تفضيل عربي'}).waitFor();
  if(await page.locator('#memory-list .panel').count()!==1)throw Error('Restored note not persisted');
  await page.locator('#memory-list button').click();
  await page.locator('#memory-list .panel').waitFor({state:'detached'});
  if(errors.length)throw Error(errors.join(';'));
  console.log(JSON.stringify({passed:true,checks:['explicit consent','session reset','cross-owner note restore','preferences unchanged','literal text rendering','reload/delete'],errors}));
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
