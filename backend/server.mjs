import http from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT || 8787);
const TIMEOUT_MS = Number(process.env.MODY_PROVIDER_TIMEOUT_MS || 60000);
const MAX_BODY_BYTES = Number(process.env.MODY_MAX_BODY_BYTES || 1_000_000);
const RATE_LIMIT_PER_MIN = Number(process.env.MODY_RATE_LIMIT_PER_MIN || 60);
const DEFAULT_MAX_OUTPUT = Math.min(Number(process.env.MODY_MAX_OUTPUT_TOKENS || 4096), 8192);
const ALLOWED_ORIGINS = new Set((process.env.MODY_ALLOWED_ORIGINS || 'https://sayedmah.github.io,http://localhost:3000,http://localhost:5173').split(',').map(s => s.trim()).filter(Boolean));
const rateBuckets = new Map();

const builtinProviders = {
  openai: {
    id: 'openai', label: 'OpenAI', kind: 'openai-responses', baseUrl: 'https://api.openai.com/v1', keyEnv: 'OPENAI_API_KEY', modelsPath: '/models', chatPath: '/responses'
  },
  anthropic: {
    id: 'anthropic', label: 'Anthropic', kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', keyEnv: 'ANTHROPIC_API_KEY', modelsPath: '/models', chatPath: '/messages'
  },
  google: {
    id: 'google', label: 'Google Gemini', kind: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', keyEnv: 'GEMINI_API_KEY', modelsPath: '/models', chatPath: null
  },
  xai: {
    id: 'xai', label: 'xAI', kind: 'openai-compatible', baseUrl: 'https://api.x.ai/v1', keyEnv: 'XAI_API_KEY', modelsPath: '/models', chatPath: '/chat/completions'
  },
  mistral: {
    id: 'mistral', label: 'Mistral', kind: 'openai-compatible', baseUrl: 'https://api.mistral.ai/v1', keyEnv: 'MISTRAL_API_KEY', modelsPath: '/models', chatPath: '/chat/completions'
  },
  groq: {
    id: 'groq', label: 'Groq', kind: 'openai-compatible', baseUrl: 'https://api.groq.com/openai/v1', keyEnv: 'GROQ_API_KEY', modelsPath: '/models', chatPath: '/chat/completions'
  },
  openrouter: {
    id: 'openrouter', label: 'OpenRouter', kind: 'openai-compatible', baseUrl: 'https://openrouter.ai/api/v1', keyEnv: 'OPENROUTER_API_KEY', modelsPath: '/models', chatPath: '/chat/completions',
    extraHeaders: () => ({
      ...(process.env.MODY_PUBLIC_URL ? { 'HTTP-Referer': process.env.MODY_PUBLIC_URL } : {}),
      'X-Title': 'MODY AI'
    })
  }
};

function loadGenericProviders() {
  const raw = process.env.MODY_GENERIC_PROVIDERS_JSON;
  if (!raw) return {};
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) throw new Error('must be an array');
    return Object.fromEntries(arr.map(p => {
      if (!p?.id || !p?.baseUrl || !p?.keyEnv) throw new Error('generic provider requires id, baseUrl, keyEnv');
      const id = String(p.id).toLowerCase().replace(/[^a-z0-9_-]/g, '');
      return [id, {
        id,
        label: p.label || id,
        kind: 'openai-compatible',
        baseUrl: String(p.baseUrl).replace(/\/$/, ''),
        keyEnv: String(p.keyEnv),
        modelsPath: p.modelsPath || '/models',
        chatPath: p.chatPath || '/chat/completions',
        extraHeaders: () => p.headers || {}
      }];
    }));
  } catch (err) {
    console.error('Invalid MODY_GENERIC_PROVIDERS_JSON:', err.message);
    return {};
  }
}

const providers = { ...builtinProviders, ...loadGenericProviders() };

function providerPublicView(p) {
  return {
    id: p.id,
    label: p.label,
    kind: p.kind,
    configured: Boolean(process.env[p.keyEnv]),
    modelDiscovery: true
  };
}

function corsHeaders(origin) {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : (ALLOWED_ORIGINS.has('*') ? '*' : '');
  return {
    ...(allowOrigin ? { 'Access-Control-Allow-Origin': allowOrigin } : {}),
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store'
  };
}

function sendJson(res, status, data, origin) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let bytes = 0;
    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function checkRateLimit(ip) {
  const minute = Math.floor(Date.now() / 60000);
  const key = `${ip}:${minute}`;
  const count = (rateBuckets.get(key) || 0) + 1;
  rateBuckets.set(key, count);
  if (rateBuckets.size > 5000) {
    for (const k of rateBuckets.keys()) if (!k.endsWith(`:${minute}`)) rateBuckets.delete(k);
  }
  return count <= RATE_LIMIT_PER_MIN;
}

async function providerFetch(url, init = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await resp.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!resp.ok) {
      const msg = data?.error?.message || data?.message || `${resp.status} ${resp.statusText}`;
      const err = new Error(msg);
      err.status = resp.status;
      err.providerPayload = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function authHeaders(p) {
  const key = process.env[p.keyEnv];
  if (!key) throw Object.assign(new Error(`${p.label} is not configured`), { status: 503 });
  if (p.kind === 'anthropic') {
    return { 'x-api-key': key, 'anthropic-version': process.env.ANTHROPIC_VERSION || '2023-06-01', 'content-type': 'application/json' };
  }
  return { Authorization: `Bearer ${key}`, 'content-type': 'application/json', ...(p.extraHeaders?.() || {}) };
}

async function listModels(p) {
  const key = process.env[p.keyEnv];
  if (!key) return [];
  if (p.kind === 'gemini') {
    let pageToken = '';
    const models = [];
    do {
      const q = new URL(`${p.baseUrl}${p.modelsPath}`);
      q.searchParams.set('key', key);
      q.searchParams.set('pageSize', '1000');
      if (pageToken) q.searchParams.set('pageToken', pageToken);
      const data = await providerFetch(q, { method: 'GET' });
      for (const m of data.models || []) {
        models.push({
          id: String(m.name || '').replace(/^models\//, ''),
          name: m.displayName || m.name,
          provider: p.id,
          capabilities: m.supportedGenerationMethods || [],
          raw: m
        });
      }
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    return models;
  }

  const url = new URL(`${p.baseUrl}${p.modelsPath}`);
  if (p.kind === 'anthropic') url.searchParams.set('limit', '1000');
  const data = await providerFetch(url, { method: 'GET', headers: authHeaders(p) });
  const items = data.data || data.models || [];
  return items.map(m => ({
    id: m.id || m.name,
    name: m.display_name || m.displayName || m.name || m.id,
    provider: p.id,
    capabilities: m.capabilities || m.features || m.supported_parameters || [],
    raw: m
  })).filter(m => m.id);
}

function normalizeMessages(messages, prompt) {
  let list = Array.isArray(messages) ? messages : [];
  if (!list.length && typeof prompt === 'string') list = [{ role: 'user', content: prompt }];
  return list
    .filter(m => m && ['system', 'user', 'assistant'].includes(m.role) && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.trim() }))
    .filter(m => m.content);
}

function parseOpenAIResponse(data) {
  if (typeof data.output_text === 'string' && data.output_text) return data.output_text;
  const parts = [];
  for (const item of data.output || []) {
    for (const c of item.content || []) {
      if (typeof c.text === 'string') parts.push(c.text);
    }
  }
  return parts.join('\n').trim();
}

async function chat(p, body) {
  const model = String(body.model || '').trim();
  if (!model || model === 'auto') throw Object.assign(new Error('A real model id is required. MODY does not invent AUTO rankings without benchmark data.'), { status: 400 });
  const messages = normalizeMessages(body.messages, body.prompt);
  if (!messages.length) throw Object.assign(new Error('At least one message is required'), { status: 400 });
  const maxTokens = Math.max(1, Math.min(Number(body.max_output_tokens || DEFAULT_MAX_OUTPUT), 8192));

  if (p.kind === 'openai-responses') {
    const data = await providerFetch(`${p.baseUrl}${p.chatPath}`, {
      method: 'POST', headers: authHeaders(p),
      body: JSON.stringify({ model, input: messages, max_output_tokens: maxTokens })
    });
    return { text: parseOpenAIResponse(data), usage: data.usage || null, rawId: data.id || null };
  }

  if (p.kind === 'anthropic') {
    const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const nonSystem = messages.filter(m => m.role !== 'system');
    const payload = { model, max_tokens: maxTokens, messages: nonSystem };
    if (system) payload.system = system;
    const data = await providerFetch(`${p.baseUrl}${p.chatPath}`, {
      method: 'POST', headers: authHeaders(p), body: JSON.stringify(payload)
    });
    const text = (data.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n');
    return { text, usage: data.usage || null, rawId: data.id || null };
  }

  if (p.kind === 'gemini') {
    const systemText = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const contents = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
    const url = new URL(`${p.baseUrl}/models/${encodeURIComponent(model)}:generateContent`);
    url.searchParams.set('key', process.env[p.keyEnv]);
    const payload = { contents, generationConfig: { maxOutputTokens: maxTokens } };
    if (systemText) payload.systemInstruction = { parts: [{ text: systemText }] };
    const data = await providerFetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const text = (data.candidates?.[0]?.content?.parts || []).map(x => x.text || '').join('\n');
    return { text, usage: data.usageMetadata || null, rawId: null };
  }

  const payload = { model, messages, max_tokens: maxTokens };
  if (typeof body.temperature === 'number') payload.temperature = Math.max(0, Math.min(body.temperature, 2));
  const data = await providerFetch(`${p.baseUrl}${p.chatPath}`, {
    method: 'POST', headers: authHeaders(p), body: JSON.stringify(payload)
  });
  const text = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? '';
  return { text: typeof text === 'string' ? text : JSON.stringify(text), usage: data.usage || null, rawId: data.id || null };
}

function getProvider(id) {
  const p = providers[String(id || '').toLowerCase()];
  if (!p) throw Object.assign(new Error('Unknown provider'), { status: 404 });
  return p;
}

async function handle(req, res) {
  const origin = req.headers.origin || '';
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin));
    return res.end();
  }

  const ip = req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) return sendJson(res, 429, { error: 'Rate limit exceeded' }, origin);

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { ok: true, service: 'MODY AI Backend', version: '0.2.0', providers: Object.values(providers).filter(p => process.env[p.keyEnv]).map(p => p.id) }, origin);
  }
  if (req.method === 'GET' && url.pathname === '/v1/providers') {
    return sendJson(res, 200, { data: Object.values(providers).map(providerPublicView) }, origin);
  }
  if (req.method === 'GET' && url.pathname === '/v1/models') {
    const providerId = url.searchParams.get('provider');
    const selected = providerId ? [getProvider(providerId)] : Object.values(providers).filter(p => process.env[p.keyEnv]);
    const settled = await Promise.allSettled(selected.map(async p => ({ provider: p.id, models: await listModels(p) })));
    const data = [];
    const errors = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') data.push(...r.value.models);
      else errors.push({ provider: selected[i].id, error: r.reason?.message || 'Model sync failed' });
    });
    return sendJson(res, 200, { data, errors }, origin);
  }
  if (req.method === 'POST' && url.pathname === '/v1/chat') {
    const body = await readJson(req);
    const p = getProvider(body.provider);
    const started = Date.now();
    const result = await chat(p, body);
    return sendJson(res, 200, { provider: p.id, model: body.model, latency_ms: Date.now() - started, ...result }, origin);
  }
  if (req.method === 'POST' && url.pathname === '/v1/multi-ai') {
    const body = await readJson(req);
    if (!Array.isArray(body.targets) || body.targets.length < 2 || body.targets.length > 8) {
      return sendJson(res, 400, { error: 'targets must contain 2-8 {provider, model} entries' }, origin);
    }
    const messages = normalizeMessages(body.messages, body.prompt);
    const results = await Promise.all(body.targets.map(async target => {
      const started = Date.now();
      try {
        const p = getProvider(target.provider);
        const out = await chat(p, { ...body, provider: target.provider, model: target.model, messages });
        return { ok: true, provider: p.id, model: target.model, latency_ms: Date.now() - started, ...out };
      } catch (err) {
        return { ok: false, provider: target.provider, model: target.model, latency_ms: Date.now() - started, error: err.message };
      }
    }));
    return sendJson(res, 200, { independent: true, results }, origin);
  }

  return sendJson(res, 404, { error: 'Not found' }, origin);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(err => {
    const origin = req.headers.origin || '';
    const status = Number(err.status) >= 400 && Number(err.status) < 600 ? Number(err.status) : 500;
    console.error(err);
    sendJson(res, status, { error: status === 500 ? 'Internal server error' : err.message }, origin);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`MODY AI Backend listening on :${PORT}`);
  console.log('Configured providers:', Object.values(providers).filter(p => process.env[p.keyEnv]).map(p => p.id).join(', ') || '(none)');
});
