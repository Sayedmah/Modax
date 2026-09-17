const MODAX_ADMIN_BACKEND='https://modaxai.onrender.com';

const adminState={user:null,overview:null};

async function authHeaders(){
  return{Authorization:`Bearer ${await window.modaxAuth.getAccessToken()}`};
}

async function api(path){
  const res=await fetch(MODAX_ADMIN_BACKEND+path,{headers:await authHeaders(),cache:'no-store'});
  if(res.status===401){location.replace('./login.html');throw new Error('Authentication required');}
  if(res.status===403){location.replace('./index.html');throw new Error('Forbidden');}
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data.error||`HTTP ${res.status}`);
  return data;
}

function canUseAdmin(role){return role==='owner'||role==='admin';}

function setText(id,value){const el=document.getElementById(id);if(el)el.textContent=value??'';}

function renderOverview(){
  const {user,overview}=adminState;
  setText('adminEmail',user?.email||'');
  setText('adminRole',user?.role||'');
  setText('overviewRole',overview?.role||user?.role||'');
  setText('overviewStatus','نشطة');
  setText('overviewSections',String(overview?.sections?.length||0));
}

async function bootAdmin(){
  const session=await window.modaxAuth.getSession();
  if(!session)return location.replace('./login.html');
  const user=await api('/v1/me');
  if(!canUseAdmin(user.role))return location.replace('./index.html');
  const overview=await api('/v1/admin/overview');
  adminState.user=user;
  adminState.overview=overview;
  renderOverview();
  document.body.dataset.ready='true';
}

document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('backToApp')?.addEventListener('click',()=>location.href='./index.html');
  document.getElementById('adminLogout')?.addEventListener('click',async()=>{await window.modaxAuth.signOut();location.replace('./login.html');});
  bootAdmin().catch(err=>{setText('adminError',err.message||'تعذر تحميل لوحة الإدارة');});
});

window.modaxAdmin={bootAdmin,canUseAdmin,api};
