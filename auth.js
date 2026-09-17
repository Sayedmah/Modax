const MODAX_SUPABASE_URL='https://ctjklckrcredhjtflddn.supabase.co';
const MODAX_SUPABASE_PUBLISHABLE_KEY='sb_publishable_gov96yUbBNbqSFlfutN2kA_2229xEBr';
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

window.modaxAuth={getClient,getSession,getAccessToken,getUser,signInWithOAuth,signInWithEmail,signUpWithEmail,resetPassword,signOut};
