export async function ensureFinalAnswer({streamText='',model,body,generate,emitStatus=()=>{},emitText=()=>{}}={}){
 const existing=String(streamText||'');
 if(existing.trim())return{text:existing,model,fallback:false,usage:null};
 if(typeof generate!=='function')throw Object.assign(new Error('No final answer generator is available'),{status:500});
 emitStatus({stage:'final_fallback',model,message:'استكمال الإجابة عبر المسار الاحتياطي'});
 const result=await generate(model,body);
 const text=String(result?.text||result?.response||'');
 if(!text.trim())throw Object.assign(new Error('No final answer from streaming or fallback generation'),{status:502});
 emitText({text,fallback:true});
 return{text,model:result?.model||model,fallback:true,usage:result?.usage||null};
}
