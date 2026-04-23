import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');

async function ensureFile(file, initial) {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(file)) await writeFile(file, JSON.stringify(initial, null, 2), 'utf8');
}

export async function readJson(name, initial = []) {
  const file = path.join(DATA_DIR, name);
  await ensureFile(file, initial);
  const txt = await readFile(file, 'utf8');
  try { return JSON.parse(txt); } catch { return initial; }
}

export async function writeJson(name, data) {
  const file = path.join(DATA_DIR, name);
  await ensureFile(file, Array.isArray(data) ? [] : {});
  const tmp = file + '.tmp';
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  const { rename } = await import('node:fs/promises');
  await rename(tmp, file);
}

export function slugify(text) {
  return String(text).toLowerCase().trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'post';
}

export function uniqueSlug(existing, base) {
  const taken = new Set(existing.map(p => p.slug));
  let slug = base, n = 2;
  while (taken.has(slug)) slug = `${base}-${n++}`;
  return slug;
}

export function estimateReadTime(text) {
  const words = String(text || '').split(/\s+/).filter(Boolean).length;
  const mins = Math.max(1, Math.round(words / 220));
  return `${mins} min read`;
}
