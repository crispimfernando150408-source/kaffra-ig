// Publica os posts do DIA já vencidos (12h e/ou 19h BRT) no Instagram, rodando no GitHub
// Actions (sem Mac). A fila é a pasta posts/<semana>/post-*.json. Não há dashboard.
// Token e IG_USER_ID vêm de Secrets (process.env). Endpoint: graph.instagram.com.
// Uso: node ig/publish-ci.mjs [caminho-do-post.json] [--dry] [--date YYYY-MM-DD]
//   sem arg = escolhe pelo dia, todos os posts cujo scheduleAt já chegou ·
//   --dry = resolve e loga cada post da lista, mas não publica nem cria container.
//   --date só vale junto com --dry (simula o dia, em America/Sao_Paulo).
//   IG_FAKE_HOUR só vale junto com --dry (simula a hora BRT, igual --date simula o dia).
import { readFileSync } from 'node:fs';
import { criarGraph, dataEfetiva, formatarErro, paramsDoReel, pickPostLocal, pollContainer, sleep } from './lib.mjs';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
let dateArg = null;
const posicionais = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--date') {
    const v = argv[i + 1];
    dateArg = v && !v.startsWith('--') ? argv[++i] : '';
    continue;
  }
  if (a.startsWith('--')) continue;
  posicionais.push(a);
}
const argPost = posicionais[0] || null;

const {
  IG_ACCESS_TOKEN,
  IG_USER_ID,
  GITHUB_REPOSITORY,
  GITHUB_REF_NAME,
  IG_POLL_TIMEOUT_MS,
  IG_FAKE_HOUR,
} = process.env;
const BRANCH = GITHUB_REF_NAME || 'main';
if (!IG_ACCESS_TOKEN || !IG_USER_ID) { console.error('Faltam Secrets IG_ACCESS_TOKEN / IG_USER_ID'); process.exit(1); }

const manual = !!argPost || DRY; // disparo manual ou --dry ignora as guardas de horário

// "hoje" e "hora" em America/Sao_Paulo
const now = new Date();
const hojeBR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
let brtHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(now));

// IG_FAKE_HOUR só existe no dry, pra simular a hora BRT (--date já simula o dia).
if (IG_FAKE_HOUR != null && IG_FAKE_HOUR !== '') {
  if (!DRY) { console.error('IG_FAKE_HOUR só vale com --dry'); process.exit(1); }
  const fake = Number(IG_FAKE_HOUR);
  if (!Number.isInteger(fake) || fake < 0 || fake > 23) { console.error('IG_FAKE_HOUR exige um inteiro 0-23'); process.exit(1); }
  brtHour = fake;
}

let todayBR;
try {
  todayBR = dataEfetiva({ dateArg, dry: DRY, hoje: hojeBR });
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// Guarda de janela: cron do GitHub atrasa (às vezes horas). Se cair fora de 11-23h,
// é atraso (ou madrugada): não publico, pra não pegar o dia errado. Dentro da janela,
// pickPostLocal já resolve só os posts cujo horário (12h/19h) já chegou.
if (!manual && (brtHour < 11 || brtHour > 23)) {
  console.log(`Agora são ${brtHour}h BRT, fora da janela 11-23h (cron atrasou). Não publico. Nada a fazer.`);
  process.exit(0);
}

const IG_POLL_TIMEOUT = Number(IG_POLL_TIMEOUT_MS) || 10 * 60 * 1000;

const escolhido = pickPostLocal({ todayBR, brtHour, arg: argPost });
const fontes = argPost ? [escolhido] : escolhido;
if (!fontes.length) { console.log(`Nenhum post agendado pra hoje (${todayBR}) até ${brtHour}h BRT. Nada a fazer.`); process.exit(0); }
if (!GITHUB_REPOSITORY && !DRY) { console.error('Sem GITHUB_REPOSITORY (rode no Actions)'); process.exit(1); }

// Imagens: raw.githubusercontent serve image/jpeg (a API aceita). Vídeo: raw serve
// octet-stream e o IG recusa, então o mp4 vai por jsDelivr, que serve video/mp4.
// No --dry sem o repo (máquina local), mostra o caminho do arquivo em vez de montar URL.
const rawUrl = (p) => `https://raw.githubusercontent.com/${GITHUB_REPOSITORY}/${BRANCH}/${p}`;
const cdnUrl = (p) => `https://cdn.jsdelivr.net/gh/${GITHUB_REPOSITORY}@${BRANCH}/${p}`;
async function pickUrl(p) {
  const raw = rawUrl(p);
  try { const r = await fetch(raw, { method: 'HEAD' }); if (r.ok) return raw; console.log(`  raw ${r.status} -> jsDelivr: ${p}`); }
  catch (e) { console.log(`  raw falhou (${formatarErro(e)}) -> jsDelivr: ${p}`); }
  return cdnUrl(p);
}

const graph = criarGraph({ accessToken: IG_ACCESS_TOKEN });

for (let i = 0; i < fontes.length; i++) {
  const fonte = fontes[i];
  const local = JSON.parse(readFileSync(fonte, 'utf8'));
  const post = { file: fonte, caption: local.caption, images: local.images, video: local.video };
  const { caption, images, video } = post;
  if (!images?.length && !video) throw new Error('Post sem imagens nem vídeo: ' + post.file);

  let urls, videoUrl;
  if (DRY && !GITHUB_REPOSITORY) {
    urls = images || [];
    videoUrl = video || null;
  } else {
    urls = [];
    for (const p of images || []) urls.push(await pickUrl(p));
    videoUrl = video ? cdnUrl(video) : null;
  }
  console.log(`Post: ${post.file} (${todayBR}) | ${videoUrl ? 'REEL: ' + videoUrl : urls.length + ' imagens'}`);
  (videoUrl ? [videoUrl] : urls).forEach((u) => console.log('  ', u));
  if (videoUrl) {
    if (urls[0]) console.log(`capa do reel: ${urls[0]}`);
    else console.log('capa do reel: sem imagem, usando o primeiro quadro (thumb_offset=0)');
  }

  // Idempotência: se um post com esta MESMA legenda já está no feed, não republica.
  // Fonte da verdade = a própria conta. Se a checagem falhar, nunca arrisco duplicado:
  // fora do --dry, não publico este post nem os seguintes do run, e saio com aviso.
  let mediaIdExistente = null;
  let checagemFalhou = false;
  try {
    const recent = await graph(`${IG_USER_ID}/media`, { params: { fields: 'id,caption', limit: '25' } });
    const igual = (recent.data || []).find((m) => (m.caption || '').trim() === (caption || '').trim());
    if (igual) mediaIdExistente = igual.id;
  } catch (e) {
    checagemFalhou = true;
    console.log('aviso: não deu pra checar duplicado:', formatarErro(e));
  }

  if (checagemFalhou && !DRY) {
    console.error('Checagem de duplicado falhou: não publico este post nem os seguintes do run, pra não arriscar duplicata.');
    process.exit(1);
  }

  if (mediaIdExistente) {
    console.log('Este post já está no feed (mesma legenda). Pulo pra não duplicar.');
    if (!DRY && i < fontes.length - 1) await sleep(60000);
    continue;
  }

  if (DRY) { console.log('--dry: resolvido, não publica.'); continue; }

  try {
    // monta o container: REEL (vídeo), imagem única, ou carrossel
    let containerId, maxPolls = 20;
    if (videoUrl) {
      containerId = (await graph(`${IG_USER_ID}/media`, { method: 'POST', params: paramsDoReel({ videoUrl, coverUrl: urls[0], caption }) })).id;
      maxPolls = 40; // vídeo demora mais pra processar
    } else if (urls.length === 1) {
      containerId = (await graph(`${IG_USER_ID}/media`, { method: 'POST', params: { image_url: urls[0], caption } })).id;
    } else {
      const children = [];
      for (const u of urls) children.push((await graph(`${IG_USER_ID}/media`, { method: 'POST', params: { image_url: u, is_carousel_item: 'true' } })).id);
      containerId = (await graph(`${IG_USER_ID}/media`, { method: 'POST', params: { media_type: 'CAROUSEL', caption, children: children.join(',') } })).id;
    }
    console.log('container:', containerId);

    await pollContainer({ graph, containerId, maxPolls, timeoutMs: IG_POLL_TIMEOUT });

    const pub = await graph(`${IG_USER_ID}/media_publish`, { method: 'POST', params: { creation_id: containerId } });
    console.log('PUBLICADO. media id:', pub.id);
  } catch (err) {
    console.error('Falha ao publicar:', formatarErro(err));
    process.exit(1);
  }

  // Entre dois posts do mesmo run, esperar 60s (rate limit / não sobrecarregar o Graph).
  if (i < fontes.length - 1) await sleep(60000);
}
