const MAX_FILES = 250;
const MAX_TOTAL_BYTES = 5_000_000;
const ALLOWED_TARGETS = new Set(['web','windows','linux','android','macos','ios']);

export function validateProjectPath(input) {
  const original = String(input ?? '');
  if (!original || original.includes('\0')) throw new Error('Unsafe project path');
  if (/^[A-Za-z]:[\\/]/.test(original) || original.startsWith('/') || original.startsWith('\\')) throw new Error('Unsafe project path');
  const normalized = original.replaceAll('\\','/');
  if (normalized.split('/').some(part => part === '..' || part === '')) throw new Error('Unsafe project path');
  return normalized;
}

export function validateManifest(files) {
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_FILES) throw new Error('Invalid manifest size');
  const seen = new Set();
  let total = 0;
  const clean = files.map(file => {
    const path = validateProjectPath(file?.path);
    if (seen.has(path)) throw new Error('Duplicate project path');
    seen.add(path);
    const content = String(file?.content ?? '');
    total += Buffer.byteLength(content, 'utf8');
    if (total > MAX_TOTAL_BYTES) throw new Error('Manifest too large');
    return { path, content };
  });
  if (!seen.has('project.godot')) throw new Error('Manifest requires project.godot');
  return clean;
}

export function buildGodotJob(projectId, files, options = {}) {
  const id = String(projectId || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Invalid project id');
  const target = String(options.target || 'web').toLowerCase();
  if (!ALLOWED_TARGETS.has(target)) throw new Error('Unsupported Godot target');
  return { schema: 1, engine: 'godot', projectId: id, target, files: validateManifest(files), requestedAt: new Date().toISOString() };
}

export function validateWorkerResult(result) {
  if (!result || !['passed','failed'].includes(result.status)) throw new Error('Invalid worker result');
  const diagnostics = Array.isArray(result.diagnostics) ? result.diagnostics.map(String).slice(0,100) : [];
  if (result.status === 'failed') return { status:'failed', diagnostics, playable:false };
  if (!result.previewUrl || !result.artifactVersion) return { status:'passed', diagnostics, playable:false };
  const url = new URL(result.previewUrl);
  if (url.protocol !== 'https:') throw new Error('Preview must use HTTPS');
  return { status:'passed', diagnostics, playable:true, previewUrl:url.toString(), artifactVersion:String(result.artifactVersion) };
}