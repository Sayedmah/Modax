const ROLE_ORDER=['owner','admin','support','user'];

export function getBearerToken(headers={}){
  const raw=String(headers.authorization||headers.Authorization||'').trim();
  const match=raw.match(/^Bearer\s+(.+)$/i);
  if(!match?.[1])throw Object.assign(new Error('Authentication required'),{status:401});
  return match[1].trim();
}

export function highestRole(roles=[]){
  const set=new Set((Array.isArray(roles)?roles:[]).map(String));
  return ROLE_ORDER.find(role=>set.has(role))||'user';
}

export function requireRole(user,allowedRoles=[]){
  if(!user||!allowedRoles.includes(user.role))throw Object.assign(new Error('Forbidden'),{status:403});
  return user;
}

export function canAccessAdmin(role){return role==='owner'||role==='admin';}

export function createAuthVerifier({issuer,audience='authenticated',jwksUrl}){
  if(!issuer||!jwksUrl)throw new Error('Auth verifier requires issuer and jwksUrl');
  let verifierPromise;
  const load=()=>verifierPromise||(verifierPromise=import('jose').then(({createRemoteJWKSet,jwtVerify})=>({
    jwks:createRemoteJWKSet(new URL(jwksUrl)),
    jwtVerify
  })));
  return async token=>{
    const {jwks,jwtVerify}=await load();
    const {payload}=await jwtVerify(token,jwks,{issuer,audience});
    if(!payload.sub)throw Object.assign(new Error('Invalid authentication token'),{status:401});
    return payload;
  };
}

export function createRoleResolver({supabaseUrl,publishableKey,fetchImpl=fetch}){
  if(!supabaseUrl||!publishableKey)throw new Error('Role resolver requires Supabase URL and publishable key');
  return async({id,accessToken})=>{
    const url=new URL('/rest/v1/user_roles',supabaseUrl);
    url.searchParams.set('select','role');
    url.searchParams.set('user_id',`eq.${id}`);
    const resp=await fetchImpl(url,{headers:{Authorization:`Bearer ${accessToken}`,apikey:publishableKey}});
    if(!resp.ok)throw Object.assign(new Error('Unable to resolve application role'),{status:resp.status===401?401:502});
    const rows=await resp.json();
    return highestRole((Array.isArray(rows)?rows:[]).map(row=>row?.role));
  };
}

let defaultVerifier;
let defaultRoleResolver;
function getDefaultVerifier(){
  const supabaseUrl=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
  if(!supabaseUrl)throw Object.assign(new Error('Supabase authentication is not configured'),{status:503});
  return defaultVerifier||(defaultVerifier=createAuthVerifier({
    issuer:`${supabaseUrl}/auth/v1`,
    audience:process.env.SUPABASE_JWT_AUDIENCE||'authenticated',
    jwksUrl:`${supabaseUrl}/auth/v1/.well-known/jwks.json`
  }));
}
function getDefaultRoleResolver(){
  const supabaseUrl=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
  const publishableKey=process.env.SUPABASE_PUBLISHABLE_KEY||'';
  if(!supabaseUrl||!publishableKey)throw Object.assign(new Error('Supabase role lookup is not configured'),{status:503});
  return defaultRoleResolver||(defaultRoleResolver=createRoleResolver({supabaseUrl,publishableKey}));
}

export async function requireUser(req){
  const accessToken=getBearerToken(req?.headers||{});
  let claims;
  try{claims=await getDefaultVerifier()(accessToken);}catch(err){
    if(err?.status)throw err;
    throw Object.assign(new Error('Invalid or expired authentication token'),{status:401});
  }
  const id=String(claims.sub||'');
  const role=await getDefaultRoleResolver()({id,accessToken});
  return{id,email:typeof claims.email==='string'?claims.email:'',claims,role,accessToken};
}
