const MODAX_SUPABASE_URL='https://ctjklckrcredhjtflddn.supabase.co';
const MODAX_SUPABASE_PUBLISHABLE_KEY='sb_publishable_gov96yUbBNbqSFlfutN2kA_2229xEBr';
const MODAX_BACKEND_URL='https://modaxai.onrender.com';
let modaxClientPromise;

async function getClient(){
  if(!modaxClientPromise){
    modaxClientPromise=import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
      .then(({createClient})=>createClient(MODAX_SUPABASE_URL,MODAX_SUPABASE_PUBLISHABLE_KEY,{
        auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
      }));
  }
  return modaxClientPromise;
}

async function getSession(){
  const client=await getClient();
  const {data,error}=await client.auth.getSession();
  if(error)throw error;
  return data.session||null;
}

async function getAccessToken(){
  const session=await getSession();
  if(!session?.access_token)throw new Error('Authentication required');
  return session.access_token;
}

async function getUser(){
  const client=await getClient();
  const {data,error}=await client.auth.getUser();
  if(error)throw error;
  return data.user||null;
}

async function signInWithOAuth(provider){
  const client=await getClient();
  const redirectTo=new URL('./index.html',location.href).href;
  const {data,error}=await client.auth.signInWithOAuth({provider,options:{redirectTo}});
  if(error)throw error;
  return data;
}

async function signInWithEmail(email,password){
  const client=await getClient();
  const {data,error}=await client.auth.signInWithPassword({email,password});
  if(error)throw error;
  return data;
}

async function signUpWithEmail(email,password){
  const client=await getClient();
  const redirectTo=new URL('./index.html',location.href).href;
  const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:redirectTo}});
  if(error)throw error;
  return data;
}

async function resetPassword(email){
  const client=await getClient();
  const redirectTo=new URL('./login.html?recovery=1',location.href).href;
  const {data,error}=await client.auth.resetPasswordForEmail(email,{redirectTo});
  if(error)throw error;
  return data;
}

async function signOut(){
  const client=await getClient();
  const {error}=await client.auth.signOut();
  if(error)throw error;
}

async function getAccount(){
  const token=await getAccessToken();
  const res=await fetch(MODAX_BACKEND_URL+'/v1/me',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
  if(res.status===401)throw Object.assign(new Error('Authentication required'),{status:401});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data.error||`HTTP ${res.status}`);
  return data;
}

async function hydrateWorkspaceAccount(){
  const roleEl=document.getElementById('accountRole');
  if(!roleEl)return null;
  try{
    const account=await getAccount();
    roleEl.textContent=account.role==='owner'?'Owner':account.role==='admin'?'Admin':account.role==='support'?'Support':'User';
    if((account.role==='owner'||account.role==='admin')&&!document.getElementById('adminEntry')){
      const link=document.createElement('a');
      link.id='adminEntry';
      link.href='./admin.html';
      link.textContent='لوحة الإدارة';
      link.style.cssText='display:block;margin-top:8px;padding:7px 9px;text-align:center;border:1px solid #4f3c78;border-radius:9px;color:#d9ccff;text-decoration:none;background:#171326;font-size:12px';
      roleEl.closest('.accountText')?.appendChild(link);
    }
    return account;
  }catch(err){
    if(err?.status===401)location.replace('./login.html');
    return null;
  }
}

window.modaxAuth={getClient,getSession,getAccessToken,getUser,getAccount,hydrateWorkspaceAccount,signInWithOAuth,signInWithEmail,signUpWithEmail,resetPassword,signOut};

document.addEventListener('DOMContentLoaded',()=>{hydrateWorkspaceAccount();});
