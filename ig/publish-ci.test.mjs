// Testes das funções extraídas pra ig/lib.mjs, todos com fetch/sleep injetados (sem rede).
// publish-ci.mjs em si é um script de topo de nível (efeitos colaterais no import); a lógica
// que importa (fila em pasta, retry, data do dry) mora em lib.mjs e é testada aqui direto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { aquecerCdn, criarEPollar, comRetry, criarGraph, dataEfetiva, dentroDaJanela, horaSimulada, paramsDoReel, pickPostLocal, pollContainer, publicarFila, relogioBR } from './lib.mjs';

function respostaJson(status, corpo) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(corpo), json: async () => corpo };
}

// ---------- fila em pasta ----------

test('pickPostLocal sem agoraBR devolve todos os posts do dia, ignora o resto', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kaffra-ig-'));
  const week = join(dir, 'semana39');
  mkdirSync(week);
  writeFileSync(join(week, 'post-a.json'), JSON.stringify({ scheduleAt: '2026-09-22T19:00:00-03:00' }));
  writeFileSync(join(week, 'post-b.json'), JSON.stringify({ scheduleAt: '2026-09-24T19:00:00-03:00' }));
  writeFileSync(join(week, 'nota.json'), '{}');
  assert.deepEqual(pickPostLocal({ todayBR: '2026-09-22', postsDir: dir }), [join(week, 'post-a.json')]);
  assert.deepEqual(pickPostLocal({ todayBR: '2026-10-01', postsDir: dir }), []);
});

test('pickPostLocal com agoraBR devolve só os posts do dia cujo horário já chegou, em ordem', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kaffra-ig-'));
  const week = join(dir, 'semana40');
  mkdirSync(week);
  const doze = join(week, 'post-a.json');
  const dezenove = join(week, 'post-b.json');
  const outroDia = join(week, 'post-c.json');
  writeFileSync(doze, JSON.stringify({ scheduleAt: '2026-09-28T12:00:00-03:00' }));
  writeFileSync(dezenove, JSON.stringify({ scheduleAt: '2026-09-28T19:00:00-03:00' }));
  writeFileSync(outroDia, JSON.stringify({ scheduleAt: '2026-09-29T12:00:00-03:00' }));

  // antes das 12h: nenhum post do dia chegou ainda
  assert.deepEqual(pickPostLocal({ todayBR: '2026-09-28', agoraBR: '11:59', postsDir: dir }), []);
  // 12h: só o do meio-dia
  assert.deepEqual(pickPostLocal({ todayBR: '2026-09-28', agoraBR: '12:00', postsDir: dir }), [doze]);
  // 19h: os dois, em ordem de horário
  assert.deepEqual(pickPostLocal({ todayBR: '2026-09-28', agoraBR: '19:13', postsDir: dir }), [doze, dezenove]);
  // 21h (cron atrasado): ainda os dois do dia, o de 12h continua na lista
  assert.deepEqual(pickPostLocal({ todayBR: '2026-09-28', agoraBR: '21:00', postsDir: dir }), [doze, dezenove]);
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

// ---------- muitos posts por dia: horário, janela e duplicata ----------

// Fila de um dia cheio: 15 posts de hora em hora, das 08:00 às 22:00, mais um das 19:30
// (sai só no run seguinte ao das 19:13) e um de outro dia.
function filaDoDia() {
  const dir = mkdtempSync(join(tmpdir(), 'kaffra-ig-'));
  const week = join(dir, 'semana46');
  mkdirSync(week);
  const porHora = {};
  for (let h = 8; h <= 22; h++) {
    const hh = String(h).padStart(2, '0');
    const f = join(week, `post-${hh}00.json`);
    writeFileSync(f, JSON.stringify({ caption: `legenda das ${hh}:00`, images: [`img/${hh}.jpg`], scheduleAt: `2026-11-12T${hh}:00:00-03:00` }));
    porHora[`${hh}:00`] = f;
  }
  const meiaHora = join(week, 'post-1930.json');
  writeFileSync(meiaHora, JSON.stringify({ caption: 'legenda das 19:30', video: 'v.mp4', scheduleAt: '2026-11-12T19:30:00-03:00' }));
  writeFileSync(join(week, 'post-amanha.json'), JSON.stringify({ caption: 'amanhã', images: ['a.jpg'], scheduleAt: '2026-11-13T08:00:00-03:00' }));
  writeFileSync(join(week, 'post-sem-hora.json'), JSON.stringify({ caption: 'sem hora', images: ['a.jpg'], scheduleAt: '2026-11-12' }));
  return { dir, porHora, meiaHora };
}

test('pickPostLocal nunca devolve post cujo horário (HH:MM) ainda não chegou', () => {
  const { dir, porHora, meiaHora } = filaDoDia();
  const ate = (hhmm) => Object.keys(porHora).filter((k) => k <= hhmm).map((k) => porHora[k]);
  // run das 08:13: só o das 08:00
  assert.deepEqual(pickPostLocal({ todayBR: '2026-11-12', agoraBR: '08:13', postsDir: dir }), [porHora['08:00']]);
  // run das 07:59: nada
  assert.deepEqual(pickPostLocal({ todayBR: '2026-11-12', agoraBR: '07:59', postsDir: dir }), []);
  // run das 19:13: até o das 19:00; o das 19:30 ainda não
  const as1913 = pickPostLocal({ todayBR: '2026-11-12', agoraBR: '19:13', postsDir: dir });
  assert.deepEqual(as1913, ate('19:13'));
  assert.ok(!as1913.includes(meiaHora));
  // run das 20:13: o das 19:30 entra, depois do das 19:00 e antes do das 20:00
  const as2013 = pickPostLocal({ todayBR: '2026-11-12', agoraBR: '20:13', postsDir: dir });
  assert.deepEqual(as2013, [...ate('19:00'), meiaHora, porHora['20:00']]);
  // qualquer hora: cada post devolvido tem scheduleAt <= agora e é do dia
  for (let h = 0; h <= 23; h++) {
    const agora = `${String(h).padStart(2, '0')}:13`;
    for (const f of pickPostLocal({ todayBR: '2026-11-12', agoraBR: agora, postsDir: dir })) {
      const s = JSON.parse(readFileSync(f, 'utf8')).scheduleAt;
      assert.equal(s.slice(0, 10), '2026-11-12');
      assert.ok(s.slice(11, 16) <= agora, `${f} (${s}) saiu no run das ${agora}`);
    }
  }
});

test('relogioBR converte o instante para o dia e a hora de Brasília', () => {
  assert.deepEqual(relogioBR(new Date('2026-11-12T11:13:00Z')), { hojeBR: '2026-11-12', brtHour: 8, agoraBR: '08:13' });
  // 01:13 UTC do dia 13 ainda é 22:13 do dia 12 em Brasília
  assert.deepEqual(relogioBR(new Date('2026-11-13T01:13:00Z')), { hojeBR: '2026-11-12', brtHour: 22, agoraBR: '22:13' });
  assert.deepEqual(relogioBR(new Date('2026-11-13T03:05:00Z')), { hojeBR: '2026-11-13', brtHour: 0, agoraBR: '00:05' });
});

test('horaSimulada aceita "H" e "HH:MM" e recusa o resto', () => {
  assert.equal(horaSimulada('8'), '08:00');
  assert.equal(horaSimulada('19:30'), '19:30');
  assert.throws(() => horaSimulada('24'), /IG_FAKE_HOUR/);
  assert.throws(() => horaSimulada('19:60'), /IG_FAKE_HOUR/);
  assert.throws(() => horaSimulada('noite'), /IG_FAKE_HOUR/);
});

test('guarda de janela aceita de 8h a 23h BRT', () => {
  for (let h = 0; h <= 23; h++) assert.equal(dentroDaJanela(h), h >= 8 && h <= 23, `hora ${h}`);
});

test('publish.yml: crons de hora em hora das 8h às 22h BRT, minuto quebrado, todos dentro da guarda', () => {
  const yml = readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8');
  const crons = [...yml.matchAll(/cron:\s*'([^']+)'/g)].map((m) => m[1].split(/\s+/));
  const horasBRT = crons.map(([min, hora, dia, mes, sem]) => {
    assert.equal([dia, mes, sem].join(' '), '* * *');
    assert.notEqual(Number(min), 0, 'cron em hora cheia');
    return (Number(hora) + 24 - 3) % 24;
  }).sort((a, b) => a - b);
  assert.deepEqual(horasBRT, Array.from({ length: 15 }, (_, i) => i + 8));
  for (const h of horasBRT) assert.ok(dentroDaJanela(h));
  assert.match(yml, /concurrency:\s*\n\s*group: publica-ig\s*\n\s*cancel-in-progress: false/);
});

// Graph falso com um feed em memória: GET {user}/media devolve as últimas 25 legendas;
// publicar() põe a legenda no feed. Serve pra simular vários runs seguidos no mesmo dia.
function contaFalsa() {
  const feed = [];
  const graph = async (path, opts = {}) => {
    assert.equal(path, 'u/media');
    assert.equal(opts.params.fields, 'id,caption');
    return { data: feed.slice(0, Number(opts.params.limit)) };
  };
  let n = 0;
  const publicar = async (post) => { const id = `m${++n}`; feed.unshift({ id, caption: post.caption }); return id; };
  return { feed, graph, publicar };
}
const lerPost = (f) => JSON.parse(readFileSync(f, 'utf8'));

test('runs de hora em hora publicam cada post uma vez só, no run do seu horário', async () => {
  const { dir, porHora, meiaHora } = filaDoDia();
  const conta = contaFalsa();
  const esperas = [];
  const visto = new Map();
  for (let h = 8; h <= 22; h++) {
    const agoraBR = `${String(h).padStart(2, '0')}:13`;
    const fontes = pickPostLocal({ todayBR: '2026-11-12', agoraBR, postsDir: dir });
    const { publicados } = await publicarFila({ fontes, graph: conta.graph, igUserId: 'u', lerPost, publicar: conta.publicar, sleepFn: async (ms) => esperas.push(ms), log: () => {} });
    for (const { fonte } of publicados) {
      assert.ok(!visto.has(fonte), `${fonte} publicado duas vezes`);
      visto.set(fonte, agoraBR);
    }
    // o run das 20:13 publica o das 19:30 e o das 20:00; os outros runs, só o da própria hora
    const esperado = h === 20 ? [meiaHora, porHora['20:00']] : [porHora[`${String(h).padStart(2, '0')}:00`]];
    assert.deepEqual(publicados.map((p) => p.fonte), esperado, `run das ${agoraBR}`);
  }
  assert.equal(conta.feed.length, 16);
  assert.equal(new Set(conta.feed.map((m) => m.caption)).size, 16);
  // só espera entre duas publicações do mesmo run (o das 20:13)
  assert.deepEqual(esperas, [60000]);
});

test('dois runs seguidos (cron atrasado + o seguinte) não duplicam', async () => {
  const { dir } = filaDoDia();
  const conta = contaFalsa();
  const opts = { graph: conta.graph, igUserId: 'u', lerPost, publicar: conta.publicar, sleepFn: async () => {}, log: () => {} };
  // primeiro run só às 12:40 (os crons das 8h às 11h falharam): sai tudo das 08:00 às 12:00
  const r1 = await publicarFila({ ...opts, fontes: pickPostLocal({ todayBR: '2026-11-12', agoraBR: '12:40', postsDir: dir }) });
  assert.equal(r1.publicados.length, 5);
  // o run seguinte cai no mesmo minuto (fila do GitHub): nada novo
  const r2 = await publicarFila({ ...opts, fontes: pickPostLocal({ todayBR: '2026-11-12', agoraBR: '12:40', postsDir: dir }) });
  assert.equal(r2.publicados.length, 0);
  assert.equal(r2.pulados.length, 5);
  // 13:13: só o das 13:00
  const r3 = await publicarFila({ ...opts, fontes: pickPostLocal({ todayBR: '2026-11-12', agoraBR: '13:13', postsDir: dir }) });
  assert.deepEqual(r3.publicados.map((p) => JSON.parse(readFileSync(p.fonte, 'utf8')).caption), ['legenda das 13:00']);
  assert.equal(conta.feed.length, 6);
});

test('publicarFila: checagem do feed falhando para o run sem publicar nada', async () => {
  const { dir } = filaDoDia();
  let publicou = 0;
  await assert.rejects(
    publicarFila({
      fontes: pickPostLocal({ todayBR: '2026-11-12', agoraBR: '10:13', postsDir: dir }),
      graph: async () => { throw new Error('Graph 500 em u/media: {}'); },
      igUserId: 'u', lerPost, publicar: async () => { publicou++; return 'x'; },
      log: () => {}, logErro: () => {},
    }),
    (e) => e.checagem === true,
  );
  assert.equal(publicou, 0);
});

test('publicarFila no --dry: checagem falhando não para, e nada é publicado', async () => {
  const { dir } = filaDoDia();
  const chamados = [];
  const r = await publicarFila({
    fontes: pickPostLocal({ todayBR: '2026-11-12', agoraBR: '10:13', postsDir: dir }),
    graph: async () => { throw new Error('Graph 400 em u/media: {}'); },
    igUserId: 'u', dry: true, lerPost, publicar: async (p) => { chamados.push(p.file); return null; },
    log: () => {},
  });
  assert.equal(chamados.length, 3);
  assert.deepEqual(r.publicados, []);
});

test('publicarFila: um post que falha ao publicar não segura os outros, e o seguinte tenta de novo', async () => {
  const { dir, porHora } = filaDoDia();
  const conta = contaFalsa();
  let quebrado = true;
  const publicar = async (post) => {
    if (quebrado && post.caption === 'legenda das 08:00') throw new Error('Container deu ERROR no processamento.');
    return conta.publicar(post);
  };
  const opts = { graph: conta.graph, igUserId: 'u', lerPost, publicar, sleepFn: async () => {}, log: () => {}, logErro: () => {} };
  const r1 = await publicarFila({ ...opts, fontes: pickPostLocal({ todayBR: '2026-11-12', agoraBR: '10:13', postsDir: dir }) });
  assert.deepEqual(r1.falhas.map((f) => f.fonte), [porHora['08:00']]);
  assert.deepEqual(r1.publicados.map((p) => p.fonte), [porHora['09:00'], porHora['10:00']]);
  quebrado = false;
  const r2 = await publicarFila({ ...opts, fontes: pickPostLocal({ todayBR: '2026-11-12', agoraBR: '11:13', postsDir: dir }) });
  assert.deepEqual(r2.publicados.map((p) => p.fonte), [porHora['08:00'], porHora['11:00']]);
  assert.equal(r2.pulados.length, 2);
  assert.equal(conta.feed.length, 4);
});

test('pickPostLocal avisa do post de hoje sem hora no scheduleAt', () => {
  const { dir } = filaDoDia();
  const avisos = [];
  pickPostLocal({ todayBR: '2026-11-12', agoraBR: '12:00', postsDir: dir, warn: (m) => avisos.push(m) });
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /post-sem-hora\.json sem hora/);
});

test('posts/: todo scheduleAt da fila tem -03:00 e horário que algum run do dia alcança (08:00 a 22:13)', () => {
  const raiz = new URL('../posts/', import.meta.url);
  const semanas = readdirSync(raiz, { withFileTypes: true }).filter((d) => d.isDirectory());
  let vistos = 0;
  for (const s of semanas) {
    for (const f of readdirSync(new URL(`${s.name}/`, raiz)).filter((f) => /^post-.*\.json$/.test(f))) {
      const { scheduleAt } = JSON.parse(readFileSync(new URL(`${s.name}/${f}`, raiz), 'utf8'));
      assert.match(scheduleAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?-03:00$/, `${s.name}/${f}`);
      const hhmm = scheduleAt.slice(11, 16);
      assert.ok(hhmm >= '08:00' && hhmm <= '22:13', `${s.name}/${f} às ${hhmm} não sai em nenhum run`);
      vistos++;
    }
  }
  assert.ok(vistos > 0);
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

// ---------- aquecer CDN e recriar container ----------

function resCdn(status, bytes) {
  return { status, headers: { get: () => String(bytes) }, arrayBuffer: async () => new ArrayBuffer(bytes) };
}
const mudo = () => {};

test('aquecerCdn segue com 200 e corpo > 0, um GET por URL', async () => {
  const vistas = [];
  await aquecerCdn(['https://cdn/v.mp4', 'https://cdn/c.jpg'], { fetchFn: async (u) => (vistas.push(u), resCdn(200, 10)), sleepFn: async () => {}, log: mudo });
  assert.deepEqual(vistas, ['https://cdn/v.mp4', 'https://cdn/c.jpg']);
});

test('aquecerCdn com 2 falhas e 1 sucesso passa, esperando 5s entre tentativas', async () => {
  const respostas = [resCdn(404, 0), resCdn(200, 0), resCdn(200, 10)];
  const esperas = [];
  await aquecerCdn(['https://cdn/v.mp4'], { fetchFn: async () => respostas.shift(), sleepFn: async (ms) => esperas.push(ms), log: mudo });
  assert.equal(respostas.length, 0);
  assert.deepEqual(esperas, [5000, 5000]);
});

test('aquecerCdn com 3 falhas lança erro claro', async () => {
  let chamadas = 0;
  await assert.rejects(
    aquecerCdn(['https://cdn/v.mp4'], { fetchFn: async () => (chamadas++, resCdn(503, 0)), sleepFn: async () => {}, log: mudo }),
    /CDN não entregou a mídia.*3 tentativas.*v\.mp4/,
  );
  assert.equal(chamadas, 3);
});

function graphFalso(statusPorContainer) {
  const chamadas = [];
  const graph = async (path, opts = {}) => {
    chamadas.push(path);
    if (opts.method === 'POST') return { id: `c${chamadas.filter((p) => p === 'u/media').length}` };
    return { status_code: statusPorContainer[path] };
  };
  return { graph, chamadas };
}

test('criarEPollar: ERROR no primeiro container e FINISHED no segundo publica', async () => {
  const { graph, chamadas } = graphFalso({ c1: 'ERROR', c2: 'FINISHED' });
  const logs = [];
  const criar = async () => (await graph('u/media', { method: 'POST' })).id;
  const id = await criarEPollar({ criar, graph, maxPolls: 3, sleepFn: async () => {}, log: (...a) => logs.push(a.join(' ')) });
  assert.equal(id, 'c2');
  assert.equal(chamadas.filter((p) => p === 'u/media').length, 2);
  assert.ok(logs.includes('container deu ERROR, recriando (tentativa 2)'));
});

test('criarEPollar: ERROR nos dois containers lança', async () => {
  const { graph, chamadas } = graphFalso({ c1: 'ERROR', c2: 'ERROR' });
  const criar = async () => (await graph('u/media', { method: 'POST' })).id;
  await assert.rejects(criarEPollar({ criar, graph, maxPolls: 3, sleepFn: async () => {}, log: mudo }), /Container deu ERROR/);
  assert.equal(chamadas.filter((p) => p === 'u/media').length, 2);
});
