// Funções extraídas de publish-ci.mjs pra ficarem testáveis sem rede real:
// injeção de fetch/fs/sleep em cada função, sem estado de módulo.
// A fila é só a pasta posts/. Não há dashboard.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const GRAPH = 'https://graph.instagram.com/v21.0';

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Formata erro de fetch com a causa (ECONNREFUSED, "bad port" etc.) quando existir, pra log claro.
export function formatarErro(err) {
  const causa = err?.cause?.code || err?.cause?.message;
  return `${err?.message || err}${causa ? ` (${causa})` : ''}`;
}

// Erros que valem retry: falha de rede (fetch failed/ECONNRESET/timeout) ou 5xx do Graph.
export function erroTransiente(err) {
  const msg = `${err?.message || ''} ${err?.cause?.code || ''} ${err?.cause?.message || ''}`;
  if (/ECONNRESET|ETIMEDOUT|ECONNREFUSED|fetch failed/i.test(msg)) return true;
  const m = /Graph (\d{3})/.exec(msg);
  if (m && Number(m[1]) >= 500) return true;
  return false;
}

// Backoff fixo (2s, 8s, 20s) só pra erro transiente; erro definitivo (4xx, etc.) estoura na hora.
export async function comRetry(fn, { tentativas = 3, delays = [2000, 8000, 20000], sleepFn = sleep, log = console.log } = {}) {
  let ultimoErro;
  for (let i = 0; i < tentativas; i++) {
    try {
      return await fn();
    } catch (err) {
      ultimoErro = err;
      if (i === tentativas - 1 || !erroTransiente(err)) throw err;
      const espera = delays[i] ?? delays[delays.length - 1];
      log(`  tentativa ${i + 1}/${tentativas} falhou (${formatarErro(err)}), nova tentativa em ${espera}ms`);
      await sleepFn(espera);
    }
  }
  throw ultimoErro;
}

// Fábrica do cliente do Graph API, com retry embutido em toda chamada.
export function criarGraph({ accessToken, fetchImpl = fetch, graphUrl = GRAPH, retryOpts = {} }) {
  async function chamada(path, { method = 'GET', params = {} } = {}) {
    const url = new URL(`${graphUrl}/${path}`);
    const opts = { method };
    const all = { ...params, access_token: accessToken };
    if (method === 'GET') for (const [k, v] of Object.entries(all)) url.searchParams.set(k, v);
    else opts.body = new URLSearchParams(all);
    const res = await fetchImpl(url, opts);
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    if (!res.ok) throw new Error(`Graph ${res.status} em ${path}: ${JSON.stringify(body?.error || body)}`);
    return body;
  }
  return (path, opts) => comRetry(() => chamada(path, opts), retryOpts);
}

// Poll do container com timeout total, pra nunca ficar preso esperando o Graph processar.
export async function pollContainer({ graph, containerId, maxPolls = 20, intervaloMs = 3000, timeoutMs, sleepFn = sleep }) {
  const inicio = Date.now();
  for (let i = 0; i < maxPolls; i++) {
    if (timeoutMs && Date.now() - inicio > timeoutMs) {
      throw new Error(`Timeout de ${timeoutMs}ms esperando o container processar (${containerId})`);
    }
    const { status_code } = await graph(containerId, { params: { fields: 'status_code' } });
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR') {
      const e = new Error('Container deu ERROR no processamento.');
      e.containerError = true;
      throw e;
    }
    await sleepFn(intervaloMs);
  }
  throw new Error(`Container não terminou de processar depois de ${maxPolls} consultas (${containerId})`);
}

// --date só existe no dry. Sem ela, vale o dia de hoje em Brasília.
export function dataEfetiva({ dateArg, dry, hoje }) {
  if (dateArg != null && dateArg !== '') {
    if (!dry) throw new Error('--date só vale com --dry');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) throw new Error('--date exige YYYY-MM-DD');
    return dateArg;
  }
  if (dateArg === '') throw new Error('--date exige YYYY-MM-DD');
  return hoje;
}

// Varre posts/*/post-*.json e devolve TODOS os do dia (scheduleAt data == hoje BR) cujo
// horário já chegou (hora BRT do scheduleAt <= brtHour), em ordem de horário — dois posts
// por dia (12h e 19h) podem sair no mesmo run se o cron atrasar. Sem brtHour, não filtra por
// hora (só pelo dia). arg explícito (caminho do post) tem prioridade e devolve como sempre,
// igual ao comportamento manual de sempre.
export function pickPostLocal({ todayBR, brtHour, arg, postsDir = 'posts', readdirSyncFn = readdirSync, readFileSyncFn = readFileSync, joinFn = join }) {
  if (arg) return arg;
  const doDia = [];
  for (const week of readdirSyncFn(postsDir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const dir = joinFn(postsDir, week.name);
    for (const f of readdirSyncFn(dir).filter((f) => /^post-.*\.json$/.test(f))) {
      const caminho = joinFn(dir, f);
      const p = JSON.parse(readFileSyncFn(caminho, 'utf8'));
      const schedule = p.scheduleAt || '';
      if (schedule.slice(0, 10) !== todayBR) continue;
      const horaMin = schedule.slice(11, 16); // "HH:MM"
      if (brtHour != null && Number(schedule.slice(11, 13)) > brtHour) continue;
      doDia.push({ caminho, horaMin });
    }
  }
  doDia.sort((a, b) => (a.horaMin < b.horaMin ? -1 : a.horaMin > b.horaMin ? 1 : 0));
  return doDia.map((x) => x.caminho);
}

// Parâmetros do container de reel. Com capa, manda cover_url (imagens[0] do post).
// Sem capa, fixa o primeiro quadro via thumb_offset em vez de deixar o Instagram escolher.
export function paramsDoReel({ videoUrl, coverUrl, caption }) {
  const params = { media_type: 'REELS', video_url: videoUrl, caption, share_to_feed: 'true' };
  if (coverUrl) params.cover_url = coverUrl;
  else params.thumb_offset = '0';
  return params;
}

// Story: só olha a extensão do arquivo pra decidir imagem × vídeo.
export function ehVideoStory(arquivo) {
  return arquivo.toLowerCase().endsWith('.mp4');
}

// URL do arquivo do story no repositório. Imagem: raw.githubusercontent (serve image/jpeg, a API
// aceita). Vídeo: raw serve octet-stream e o IG recusa, então vai por jsDelivr (serve video/mp4,
// limite de 20 MB por arquivo). Sem GITHUB_REPOSITORY (dry local), devolve o caminho como está.
export function urlDaStory({ arquivo, githubRepository, branch = 'main' }) {
  if (!githubRepository) return arquivo;
  return ehVideoStory(arquivo)
    ? `https://cdn.jsdelivr.net/gh/${githubRepository}@${branch}/${arquivo}`
    : `https://raw.githubusercontent.com/${githubRepository}/${branch}/${arquivo}`;
}

// Parâmetros do container de story. Vídeo manda video_url; imagem manda image_url.
export function paramsDaStory({ url, video }) {
  return video ? { media_type: 'STORIES', video_url: url } : { media_type: 'STORIES', image_url: url };
}

// Aquece o CDN: GET completo de cada URL de mídia, só segue com HTTP 200 e corpo > 0 bytes.
// Até `tentativas` por URL, com espera entre elas. Se não der 200, lança com a URL no erro.
export async function aquecerCdn(urls, { fetchFn = fetch, sleepFn = sleep, tentativas = 3, esperaMs = 5000, log = console.log } = {}) {
  for (const url of urls.filter(Boolean)) {
    let motivo = '';
    for (let t = 1; t <= tentativas; t++) {
      try {
        const res = await fetchFn(url);
        const corpo = await res.arrayBuffer();
        const header = res.headers?.get?.('content-length');
        const tamanho = corpo.byteLength || 0;
        if (res.status === 200 && tamanho > 0 && (header == null || Number(header) > 0)) {
          log(`CDN aquecido: ${url} (${tamanho} bytes)`);
          break;
        }
        motivo = `HTTP ${res.status}, ${tamanho} bytes`;
      } catch (e) {
        motivo = e?.message || String(e);
      }
      if (t === tentativas) throw new Error(`CDN não entregou a mídia (${motivo}) após ${tentativas} tentativas: ${url}`);
      await sleepFn(esperaMs);
    }
  }
}

// Cria o container e espera processar. Se der ERROR, recria uma vez (nova criação + poll).
// `criar` é uma função que faz a(s) chamada(s) de criação e devolve o containerId.
export async function criarEPollar({ criar, graph, maxPolls, timeoutMs, sleepFn = sleep, log = console.log }) {
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const containerId = await criar();
    log('container:', containerId);
    try {
      await pollContainer({ graph, containerId, maxPolls, timeoutMs, sleepFn });
      return containerId;
    } catch (e) {
      if (!e.containerError || tentativa === 2) throw e;
      log('container deu ERROR, recriando (tentativa 2)');
    }
  }
}
