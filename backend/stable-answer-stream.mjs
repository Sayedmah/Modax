export async function runStableAnswer({candidates=[],body={},generate,emit=()=>{},shouldFallback=()=>false}){
  if(!Array.isArray(candidates)||!candidates.length)throw Object.assign(new Error('No candidate models available'),{status:503});
  if(typeof generate!=='function')throw new TypeError('generate is required');
  const attempts=[];
  for(let i=0;i<candidates.length;i++){
    const model=candidates[i];
    emit('status',{stage:'model',model,message:`${model} يعمل الآن`});
    emit('model',{model});
    try{
      const out=await generate(model,body);
      const text=String(out?.text||'').trim();
      if(!text)throw Object.assign(new Error('Model returned an empty final answer'),{status:502});
      emit('text',{text});
      if(out?.usage)emit('usage',{usage:out.usage});
      emit('done',{model,attempts,stable:true});
      return {model,text,usage:out?.usage||null,attempts};
    }catch(err){
      attempts.push({model,status:Number(err?.status||500),error:err?.message||'Unknown error'});
      const next=candidates[i+1];
      if(next&&shouldFallback(err)){
        emit('status',{stage:'fallback',model,next,message:`${model} غير متاح — الانتقال إلى ${next}`});
        continue;
      }
      err.attempts=attempts;
      throw err;
    }
  }
  const err=Object.assign(new Error('All available models failed to return a final answer'),{status:503,attempts});
  throw err;
}
