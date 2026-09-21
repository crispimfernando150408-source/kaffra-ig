// Publica o post do DIA no Instagram, rodando no GitHub Actions (sem Mac).
// A fila é a pasta posts/<semana>/post-*.json. Não há dashboard.
// Token e IG_USER_ID vêm de Secrets (process.env). Endpoint: graph.instagram.com.
// Uso: node ig/publish-ci.mjs [caminho-do-post.json] [--dry] [--date YYYY-MM-DD]
//   sem arg = escolhe pelo dia · --dry = resolve e loga, mas não publica nem cria container.
//   --date só vale junto com --dry (simula o dia, em America/Sao_Paulo).
import { readFileSync } from 'node:fs';
import { criarGraph, dataEfetiva, formatarErro, paramsDoReel, pickPostLocal, pollContainer } from './lib.mjs';

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
} = process.env;
const BRANCH = GITHUB_REF_NAME || 'main';
if (!IG_ACCESS_TOKEN || !IG_USER_ID) { console.error('Faltam Secrets IG_ACCESS_TOKEN / IG_USER_ID'); process.exit(1); }

const manual = !!argPost || DRY; // disparo manual ou --dry ignora as guardas de horário

// "hoje" e "hora" em America/Sao_Paulo
const now = new Date();
const hojeBR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const brtHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(now));

let todayBR;
try {
  todayBR = dataEfetiva({ dateArg, dry: DRY, hoje: hojeBR });
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// Guarda de janela: cron do GitHub atrasa (às vezes horas). Se cair fora da noite,
// é atraso: não publico, pra não sair de madrugada nem pegar o dia errado.
if (!manual && (brtHour < 18 || brtHour > 23)) {
  console.log(`Agora são ${brtHour}h BRT, fora da janela 18-23h (cron atrasou). Não publico. Nada a fazer.`);
  process.exit(0);
}

const IG_POLL_TIMEOUT = Number(IG_POLL_TIMEOUT_MS) || 10 * 60 * 1000;

const fonte = pickPostLocal({ todayBR, arg: argPost });
if (!fonte) { console.log(`Nenhum post agendado pra hoje (${todayBR}). Nada a fazer.`); process.exit(0); }
if (!GITHUB_REPOSITORY && !DRY) { console.error('Sem GITHUB_REPOSITORY (rode no Actions)'); process.exit(1); }

const local = JSON.parse(readFileSync(fonte, 'utf8'));
const post = { file: fonte, caption: local.caption, images: local.images, video: local.video };
const { caption, images, video } = post;
if (!images?.length && !video) throw new Error('Post sem imagens nem vídeo: ' + post.file);

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

const graph = criarGraph({ accessToken: IG_ACCESS_TOKEN });

// Idempotência: se um post com esta MESMA legenda já está no feed, não republica.
// Fonte da verdade = a própria conta. Mata duplicata mesmo se o cron rodar 2×.
let mediaIdExistente = null;
try {
  const recent = await graph(`${IG_USER_ID}/media`, { params: { fields: 'id,caption', limit: '25' } });
  const igual = (recent.data || []).find((m) => (m.caption || '').trim() === (caption || '').trim());
  if (igual) mediaIdExistente = igual.id;
} catch (e) { console.log('aviso: não deu pra checar duplicado, sigo:', formatarErro(e)); }

if (mediaIdExistente) {
  console.log('Este post já está no feed (mesma legenda). Pulo pra não duplicar.');
  process.exit(0);
}

if (DRY) { console.log('--dry: resolvido, não publica.'); process.exit(0); }

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
