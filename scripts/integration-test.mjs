// Testa o app contra o projeto Supabase real: cria dois usuários temporários já
// confirmados, roda os testes *.integration.test.ts (tarefas e compras) e apaga os usuários.
// Uso: node scripts/integration-test.mjs   (requer .env.supabase)
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.supabase', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const ref = env.SUPABASE_PROJECT_REF;
const url = `https://${ref}.supabase.co`;

const keysRes = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, {
  headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` },
});
if (!keysRes.ok) throw new Error(`api-keys: HTTP ${keysRes.status} ${await keysRes.text()}`);
const keys = await keysRes.json();
const secret = keys.find((k) => k.type === 'secret')?.api_key ?? keys.find((k) => k.name === 'service_role')?.api_key;
const publishable = keys.find((k) => k.type === 'publishable')?.api_key;
if (!secret || !publishable) throw new Error('Chaves do projeto não encontradas.');

const admin = (path, init = {}) =>
  fetch(`${url}/auth/v1/admin${path}`, {
    ...init,
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
  });

const stamp = Date.now();
const users = [1, 2].map((n) => ({ email: `it-${stamp}-${n}@clareia.test`, password: `Teste-${stamp}-${n}` }));
const created = [];
try {
  for (const u of users) {
    const res = await admin('/users', { method: 'POST', body: JSON.stringify({ ...u, email_confirm: true }) });
    if (!res.ok) throw new Error(`criar usuário: HTTP ${res.status} ${await res.text()}`);
    created.push((await res.json()).id);
  }
  // Serial: os dois arquivos usam as mesmas contas; em paralelo um restore apaga dados do outro.
  const run = spawnSync('npx', ['vitest', 'run', '--no-file-parallelism', 'integration.test.ts'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, CLAREIA_IT_URL: url, CLAREIA_IT_KEY: publishable, CLAREIA_IT_USERS: JSON.stringify(users) },
  });
  process.exitCode = run.status ?? 1;
} finally {
  for (const id of created) {
    const res = await admin(`/users/${id}`, { method: 'DELETE' });
    console.log(`usuário temporário removido: ${res.ok ? 'ok' : `HTTP ${res.status}`}`);
  }
}
