// Renova o token longo do Instagram (vale 60 dias) e grava de volta no Secret IG_ACCESS_TOKEN.
// Roda mensalmente no Actions. Precisa do Secret GH_PAT (PAT com permissão de escrever secrets).
// Se GH_PAT não existir, o job falha com erro e NUNCA imprime o token (log de Actions é público).
import { execFileSync } from 'node:child_process';

const tok = process.env.IG_ACCESS_TOKEN;
if (!tok) { console.error('Sem IG_ACCESS_TOKEN'); process.exit(1); }

// Sem GH_PAT não há onde gravar o token novo: falha antes de renovar, sem nunca imprimir o token.
const repo = process.env.GITHUB_REPOSITORY;
if (!process.env.GH_PAT || !repo) {
  console.log('::error::Sem GH_PAT: token NÃO foi renovado nem gravado. Configure o secret GH_PAT (escopo de secrets do repo) e rode de novo.');
  process.exit(1);
}

const url = new URL('https://graph.instagram.com/refresh_access_token');
url.searchParams.set('grant_type', 'ig_refresh_token');
url.searchParams.set('access_token', tok);
const j = await (await fetch(url)).json();
if (!j.access_token) throw new Error('Falha no refresh: ' + JSON.stringify(j));
// Mascara o token novo no log do Actions antes de qualquer outra saída.
console.log('::add-mask::' + j.access_token);
console.log(`Token renovado (~${Math.round((j.expires_in||0)/86400)} dias).`);

// Grava no Secret via API do GitHub (gh CLI já vem no runner). O token vai pela entrada
// padrão, nunca na linha de comando, para não aparecer em mensagem de erro.
try {
  execFileSync('gh', ['secret', 'set', 'IG_ACCESS_TOKEN', '--repo', repo], {
    input: j.access_token,
    stdio: ['pipe', 'inherit', 'inherit'],
    env: { ...process.env, GH_TOKEN: process.env.GH_PAT },
  });
} catch (e) {
  console.log(`::error::gh secret set falhou (status ${e.status ?? 'desconhecido'}): IG_ACCESS_TOKEN NÃO foi atualizado.`);
  process.exit(1);
}
console.log('Secret IG_ACCESS_TOKEN atualizado automaticamente.');
