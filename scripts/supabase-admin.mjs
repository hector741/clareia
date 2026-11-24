// Administração do projeto Supabase pela Management API (uso local, nunca no app).
// Lê SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_REF de .env.supabase.
//
//   node scripts/supabase-admin.mjs sql <arquivo.sql | "consulta">
//   node scripts/supabase-admin.mjs get </advisors/security>
//   node scripts/supabase-admin.mjs auth-get <campo1,campo2>
//   node scripts/supabase-admin.mjs auth-patch <arquivo.json>
import { existsSync, readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.supabase', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const token = env.SUPABASE_ACCESS_TOKEN;
const ref = env.SUPABASE_PROJECT_REF;
if (!token || !ref) throw new Error('Defina SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_REF em .env.supabase');

const api = async (method, path, body) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${text}`);
    process.exit(1);
  }
  return text ? JSON.parse(text) : null;
};

const [command, arg] = process.argv.slice(2);
if (command === 'sql') {
  const query = existsSync(arg) ? readFileSync(arg, 'utf8') : arg;
  console.log(JSON.stringify(await api('POST', '/database/query', { query }), null, 2));
} else if (command === 'get') {
  console.log(JSON.stringify(await api('GET', arg), null, 2));
} else if (command === 'auth-get') {
  const config = await api('GET', '/config/auth');
  const fields = arg ? arg.split(',') : Object.keys(config);
  console.log(JSON.stringify(Object.fromEntries(fields.map((f) => [f, config[f]])), null, 2));
} else if (command === 'auth-patch') {
  const patch = JSON.parse(readFileSync(arg, 'utf8'));
  const config = await api('PATCH', '/config/auth', patch);
  console.log(JSON.stringify(Object.fromEntries(Object.keys(patch).map((f) => [f, config[f]])), null, 2));
} else {
  console.error('Comandos: sql, auth-get, auth-patch');
  process.exit(1);
}
