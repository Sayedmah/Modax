const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true});const page=await browser.newPage();
  page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:8776');
  if(process.env.MODAX_QA_GUEST!=='true'){
    await page.locator('#username').fill('files'+Date.now());
    await page.locator('#password').fill('qa-secure-password123');await page.locator('#register').click();
  }
  await page.locator('#app').waitFor({state:'visible'});await page.locator('[data-view=files]').click();
  async function upload(name,text){
    await page.locator('#document-file').setInputFiles({name,mimeType:'text/plain',buffer:Buffer.from(text)});
    const response=page.waitForResponse(r=>r.url().endsWith('/api/v1/files')&&r.request().method()==='POST');
    await page.locator('#file-form button').click();const doc=await(await response).json();
    await page.locator('#file-list strong').filter({hasText:name}).waitFor();return doc.id;
  }
  const victim=await upload('remove.txt','deletion_unique_fixture');
  const keeper=await upload('keep.txt','unrelated fixture');
  await page.locator('[data-view=chat]').click();await page.locator('#chat-attachment').selectOption(victim);
  await page.locator('[data-view=files]').click();await page.locator('[data-file-id="'+victim+'"]').waitFor();
  await page.locator('#file-search').fill('deletion_unique_fixture');await page.locator('#file-search-form button').click();
  await page.locator('#file-hits pre').filter({hasText:'deletion_unique_fixture'}).waitFor();
  const panel=page.locator('[data-file-id="'+victim+'"]');
  await panel.getByText('عرض النص',{exact:true}).click();await panel.locator('pre').waitFor();
  let deletes=0;page.on('request',r=>{if(r.method()==='DELETE'&&r.url().endsWith('/files/'+victim))deletes++;});
  page.once('dialog',dialog=>dialog.dismiss());await panel.locator('.file-delete').click();
  if(deletes!==0||!await panel.isVisible())throw Error('Cancel did not preserve file');
  page.once('dialog',dialog=>{if(!dialog.message().includes('المحادثات السابقة'))throw Error('Retention warning missing');return dialog.accept();});
  await panel.locator('.file-delete').click();await page.locator('#notice').filter({hasText:'حُذف المستند'}).waitFor();
  if(deletes!==1||await page.locator('[data-file-id="'+victim+'"]').count())throw Error('Delete failed');
  if(await page.locator('#chat-attachment').inputValue()!=='')throw Error('Deleted attachment retained');
  if(await page.locator('#file-hits pre').count())throw Error('Deleted search results retained');
  await page.locator('[data-view=chat]').click();await page.locator('#chat-attachment').selectOption(keeper);await page.locator('[data-view=files]').click();
  await page.locator('[data-file-id="'+keeper+'"]').waitFor();
  if(await page.locator('#chat-attachment').inputValue()!==keeper)throw Error('Unrelated selection lost');
  await page.reload();await page.locator('#app').waitFor({state:'visible'});await page.locator('[data-view=files]').click();
  await page.locator('[data-file-id="'+keeper+'"]').waitFor();
  if(await page.locator('[data-file-id="'+victim+'"]').count())throw Error('Deleted file returned after reload');
  if(errors.length)throw Error(errors.join(';'));
  console.log(JSON.stringify({passed:true,checks:['delete confirmation/cancel','retention warning','preview removal','search cleanup','attachment cleanup','unrelated selection','reload'],errors}));
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
