// Testes das funções extraídas pra ig/lib.mjs, todos com fetch/sleep injetados (sem rede).
// publish-ci.mjs em si é um script de topo de nível (efeitos colaterais no import); a lógica
// que importa (fila em pasta, retry, data do dry) mora em lib.mjs e é testada aqui direto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { comRetry, criarGraph, dataEfetiva, paramsDoReel, pickPostLocal, pollContainer } from './lib.mjs';

function respostaJson(status, corpo) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(corpo), json: async () => corpo };
}

// ---------- fila em pasta ----------

test('pickPostLocal acha o post cujo scheduleAt é o dia e ignora o resto', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kaffra-ig-'));
  const week = join(dir, 'semana39');
  mkdirSync(week);
  writeFileSync(join(week, 'post-a.json'), JSON.stringify({ scheduleAt: '2026-09-22T19:00:00-03:00' }));
  writeFileSync(join(week, 'post-b.json'), JSON.stringify({ scheduleAt: '2026-09-24T19:00:00-03:00' }));
  writeFileSync(join(week, 'nota.json'), '{}');
  assert.equal(pickPostLocal({ todayBR: '2026-09-22', postsDir: dir }), join(week, 'post-a.json'));
  assert.equal(pickPostLocal({ todayBR: '2026-10-01', postsDir: dir }), null);
});

test('pickPostLocal com caminho explícito não varre a pasta', () => {
  assert.equal(
    pickPostLocal({ todayBR: '2026-09-22', arg: 'posts/x.json', readdirSyncFn: () => { throw new Error('não devia varrer'); } }),
    'posts/x.json'
  );
});

test('dataEfetiva usa --date só no dry e rejeita fora dele', () => {
  assert.equal(dataEfetiva({ dateArg: '2026-09-22', dry: true, hoje: '2026-09-21' }), '2026-09-22');
  assert.equal(dataEfetiva({ dateArg: null, dry: false, hoje: '2026-09-21' }), '2026-09-21');
  assert.throws(() => dataEfetiva({ dateArg: '2026-09-22', dry: false, hoje: '2026-09-21' }), /só vale com --dry/);
  assert.throws(() => dataEfetiva({ dateArg: 'amanha', dry: true, hoje: '2026-09-21' }), /YYYY-MM-DD/);
  assert.throws(() => dataEfetiva({ dateArg: '', dry: true, hoje: '2026-09-21' }), /YYYY-MM-DD/);
});

// ---------- retry (comRetry / criarGraph) ----------

test('comRetry tenta de novo em erro transiente e devolve o resultado quando funciona', async () => {
  let chamadas = 0;
  const esperas = [];
  const resultado = await comRetry(
    async () => { chamadas++; if (chamadas < 3) { const e = new Error('fetch failed'); e.cause = { code: 'ECONNRESET' }; throw e; } return 'ok'; },
    { sleepFn: async (ms) => esperas.push(ms), log: () => {} }
  );
  assert.equal(resultado, 'ok');
  assert.equal(chamadas, 3);
  assert.deepEqual(esperas, [2000, 8000]);
});

test('comRetry não tenta de novo em erro definitivo (4xx)', async () => {
  let chamadas = 0;
  await assert.rejects(
    () => comRetry(async () => { chamadas++; throw new Error('Graph 400 em algo: {}'); }, { sleepFn: async () => {}, log: () => {} }),
    /Graph 400/
  );
  assert.equal(chamadas, 1);
});

test('comRetry desiste depois das tentativas e propaga o último erro', async () => {
  let chamadas = 0;
  await assert.rejects(
    () => comRetry(async () => { chamadas++; const e = new Error('fetch failed'); e.cause = { code: 'ECONNRESET' }; throw e; }, { sleepFn: async () => {}, log: () => {} }),
    (err) => { assert.equal(err.cause.code, 'ECONNRESET'); return true; }
  );
  assert.equal(chamadas, 3);
});

test('criarGraph aplica retry em ECONNRESET do Graph e depois publica normal', async () => {
  let chamadas = 0;
  const fetchImpl = async () => {
    chamadas++;
    if (chamadas === 1) { const e = new Error('fetch failed'); e.cause = { code: 'ECONNRESET' }; throw e; }
    return respostaJson(200, { id: 'container1' });
  };
  const graph = criarGraph({ accessToken: 'tok', fetchImpl, retryOpts: { sleepFn: async () => {}, log: () => {} } });
  const resultado = await graph('123/media', { method: 'POST', params: { image_url: 'http://x/a.jpg' } });
  assert.equal(resultado.id, 'container1');
  assert.equal(chamadas, 2);
});

test('criarGraph propaga erro do Graph (status != 2xx) pro chamador', async () => {
  const fetchImpl = async () => respostaJson(400, { error: { message: 'parâmetro inválido' } });
  const graph = criarGraph({ accessToken: 'tok', fetchImpl, retryOpts: { sleepFn: async () => {}, log: () => {} } });
  await assert.rejects(() => graph('123/media', { method: 'POST' }), /Graph 400/);
});

// ---------- pollContainer ----------

test('pollContainer retorna assim que o container termina', async () => {
  let chamadas = 0;
  const graph = async () => { chamadas++; return { status_code: chamadas < 2 ? 'IN_PROGRESS' : 'FINISHED' }; };
  await pollContainer({ graph, containerId: 'c1', sleepFn: async () => {} });
  assert.equal(chamadas, 2);
});

test('pollContainer estoura em timeout total em vez de ficar preso', async () => {
  let agora = 0;
  const original = Date.now;
  Date.now = () => (agora += 1000);
  try {
    const graph = async () => ({ status_code: 'IN_PROGRESS' });
    await assert.rejects(
      () => pollContainer({ graph, containerId: 'c1', maxPolls: 1000, timeoutMs: 5000, sleepFn: async () => {} }),
      /Timeout/
    );
  } finally { Date.now = original; }
});

test('pollContainer estoura se o Graph reportar ERROR', async () => {
  const graph = async () => ({ status_code: 'ERROR' });
  await assert.rejects(() => pollContainer({ graph, containerId: 'c1', sleepFn: async () => {} }), /ERROR/);
});

// ---------- paramsDoReel ----------

test('paramsDoReel com capa inclui cover_url e não tem thumb_offset', () => {
  const params = paramsDoReel({
    videoUrl: 'https://cdn.example/reel.mp4',
    coverUrl: 'https://cdn.example/capa.jpg',
    caption: 'legenda intacta do reel',
  });
  assert.equal(params.media_type, 'REELS');
  assert.equal(params.video_url, 'https://cdn.example/reel.mp4');
  assert.equal(params.cover_url, 'https://cdn.example/capa.jpg');
  assert.equal(params.share_to_feed, 'true');
  assert.equal(params.caption, 'legenda intacta do reel');
  assert.equal('thumb_offset' in params, false);
});

test('paramsDoReel sem capa inclui thumb_offset e não tem cover_url', () => {
  const params = paramsDoReel({
    videoUrl: 'https://cdn.example/reel.mp4',
    coverUrl: null,
    caption: 'legenda intacta do reel',
  });
  assert.equal(params.media_type, 'REELS');
  assert.equal(params.video_url, 'https://cdn.example/reel.mp4');
  assert.equal(params.thumb_offset, '0');
  assert.equal(params.share_to_feed, 'true');
  assert.equal(params.caption, 'legenda intacta do reel');
  assert.equal('cover_url' in params, false);
});
