export const GEMINI_AUTO_PRIORITY=[
 'gemini-3.8-flash',
 'gemini-3.7-flash',
 'gemini-3.6-flash',
 'gemini-3.5-flash',
 'gemini-3.5-flash-lite'
];

const EXCLUDED=/image|tts|live|audio|embed|embedding|veo|lyria|robot|computer-use/i;

export function rankAvailableGeminiModels(models=[]){
 const usable=new Set(models.filter(m=>m&&m.id&&!EXCLUDED.test(m.id)&&Array.isArray(m.capabilities)&&m.capabilities.includes('generateContent')).map(m=>m.id));
 return GEMINI_AUTO_PRIORITY.filter(id=>usable.has(id));
}

export function shouldFallbackGeminiError(err={}){
 const status=Number(err.status||0);
 if([404,408,409,429,500,502,503,504].includes(status))return true;
 const message=String(err.message||'').toLowerCase();
 return /high demand|overload|capacity|temporar|unavailable|no longer available|not found|resource exhausted|rate limit|quota/.test(message);
}
