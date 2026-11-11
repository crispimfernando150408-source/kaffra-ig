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

// Relógio de Brasília: dia (YYYY-MM-DD), hora (0-23) e "HH:MM" de um instante.
export function relogioBR(now = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map((p) => [p.type, p.value])
  );
  const hora = partes.hour === '24' ? '00' : partes.hour;
  return { hojeBR: `${partes.year}-${partes.month}-${partes.day}`, brtHour: Number(hora), agoraBR: `${hora}:${partes.minute}` };
}

// IG_FAKE_HOUR (só no dry): "19" vira 19:00, "19:30" vira 19:30. Devolve "HH:MM" ou lança.
export function horaSimulada(valor) {
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(String(valor).trim());
  const h = m ? Number(m[1]) : NaN;
  const min = m && m[2] != null ? Number(m[2]) : 0;
  if (!m || h > 23 || min > 59) throw new Error('IG_FAKE_HOUR exige a hora 0-23 ou HH:MM');
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

// Guarda de janela do cron: só publica de 8h a 23h BRT. Fora disso é cron atrasado
// (ou madrugada) e não publica, pra não pegar o dia errado.
export const JANELA_BRT = { de: 8, ate: 23 };
export function dentroDaJanela(brtHour) {
  return brtHour >= JANELA_BRT.de && brtHour <= JANELA_BRT.ate;
}

// Varre posts/*/post-*.json e devolve TODOS os do dia (scheduleAt data == hoje BR) cujo
// horário já chegou (scheduleAt "HH:MM" <= agoraBR "HH:MM", ambos em BRT), em ordem de
// horário. Um post das 19:30 não sai num run das 19:13: espera o run seguinte. Os do dia
// que já chegaram continuam na lista em todo run do dia (se um cron falhar, o seguinte
// pega); quem impede a duplicata é a checagem de legenda em publicarFila. Sem agoraBR, não
// filtra por hora (só pelo dia). arg explícito (caminho do post) tem prioridade e volta como
// veio, igual ao comportamento manual de sempre.
export function pickPostLocal({ todayBR, agoraBR, arg, postsDir = 'posts', readdirSyncFn = readdirSync, readFileSyncFn = readFileSync, joinFn = join }) {
  if (arg) return arg;
  const doDia = [];
  for (const week of readdirSyncFn(postsDir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const dir = joinFn(postsDir, week.name);
    for (const f of readdirSyncFn(dir).filter((f) => /^post-.*\.json$/.test(f))) {
      const caminho = joinFn(dir, f);
      const p = JSON.parse(readFileSyncFn(caminho, 'utf8'));
      const schedule = p.scheduleAt || '';
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(schedule)) continue;
      if (schedule.slice(0, 10) !== todayBR) continue;
      const horaMin = schedule.slice(11, 16); // "HH:MM"
      if (agoraBR != null && horaMin > agoraBR) continue;
      doDia.push({ caminho, horaMin });
    }
  }
  doDia.sort((a, b) => (a.horaMin < b.horaMin ? -1 : a.horaMin > b.horaMin ? 1 : (a.caminho < b.caminho ? -1 : 1)));
  return doDia.map((x) => x.caminho);
}

// Idempotência: procura nas últimas `limite` mídias do feed uma com a MESMA legenda.
// Devolve o id da mídia ou null. Erro do Graph propaga (quem chama decide).
export async function idNoFeed({ graph, igUserId, caption, limite = 25 }) {
  const recent = await graph(`${igUserId}/media`, { params: { fields: 'id,caption', limit: String(limite) } });
  const alvo = (caption || '').trim();
  const igual = (recent.data || []).find((m) => (m.caption || '').trim() === alvo);
  return igual ? igual.id : null;
}

// Publica uma lista de posts em ordem. Antes de cada um, checa a legenda no feed: se já
// está, pula (é o que impede dois runs seguidos de duplicarem). Se a checagem falhar fora
// do --dry, para o run inteiro (lança) pra nunca arriscar duplicata. Espera `esperaMs`
// entre duas publicações do mesmo run. `publicar(post)` monta e publica o container e
// devolve o media id; `lerPost(caminho)` devolve { caption, images, video }.
export async function publicarFila({ fontes, graph, igUserId, dry = false, lerPost, publicar, sleepFn = sleep, esperaMs = 60000, log = console.log, logErro = console.error }) {
  const publicados = [];
  const pulados = [];
  for (let i = 0; i < fontes.length; i++) {
    const fonte = fontes[i];
    const local = lerPost(fonte);
    const post = { file: fonte, caption: local.caption, images: local.images, video: local.video };
    if (!post.images?.length && !post.video) throw new Error('Post sem imagens nem vídeo: ' + post.file);

    let mediaIdExistente = null;
    try {
      mediaIdExistente = await idNoFeed({ graph, igUserId, caption: post.caption });
    } catch (e) {
      log('aviso: não deu pra checar duplicado:', formatarErro(e));
      if (!dry) {
        logErro('Checagem de duplicado falhou: não publico este post nem os seguintes do run, pra não arriscar duplicata.');
        const err = new Error('checagem de duplicado falhou');
        err.checagem = true;
        throw err;
      }
    }

    if (mediaIdExistente) {
      log(`Já está no feed (mesma legenda): ${fonte}. Pulo pra não duplicar.`);
      pulados.push(fonte);
      continue;
    }

    const id = await publicar(post);
    if (dry) continue;
    log('PUBLICADO. media id:', id);
    publicados.push({ fonte, id });

    // Entre duas publicações do mesmo run, esperar (rate limit / não sobrecarregar o Graph).
    if (i < fontes.length - 1) await sleepFn(esperaMs);
  }
  return { publicados, pulados };
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
