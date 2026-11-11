// Publica os posts do DIA já vencidos (scheduleAt <= agora, em BRT) no Instagram, rodando no
// GitHub Actions (sem Mac). O cron roda de hora em hora, das 8h às 22h BRT. A fila é a pasta posts/<semana>/post-*.json. Não há dashboard.
// Token e IG_USER_ID vêm de Secrets (process.env). Endpoint: graph.instagram.com.
// Uso: node ig/publish-ci.mjs [caminho-do-post.json] [--dry] [--date YYYY-MM-DD]
//   sem arg = escolhe pelo dia, todos os posts cujo scheduleAt já chegou ·
//   --dry = resolve e loga cada post da lista, mas não publica nem cria container.
//   --date só vale junto com --dry (simula o dia, em America/Sao_Paulo).
//   IG_FAKE_HOUR só vale junto com --dry (simula a hora BRT, "19" ou "19:30", igual --date simula o dia).
import { readFileSync } from 'node:fs';
import { JANELA_BRT, aquecerCdn, criarEPollar, criarGraph, dataEfetiva, dentroDaJanela, formatarErro, horaSimulada, paramsDoReel, pickPostLocal, publicarFila, relogioBR } from './lib.mjs';

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
let { hojeBR, brtHour, agoraBR } = relogioBR(new Date());

// IG_FAKE_HOUR só existe no dry, pra simular a hora BRT (--date já simula o dia).
if (IG_FAKE_HOUR != null && IG_FAKE_HOUR !== '') {
  if (!DRY) { console.error('IG_FAKE_HOUR só vale com --dry'); process.exit(1); }
  try { agoraBR = horaSimulada(IG_FAKE_HOUR); } catch (err) { console.error(err.message); process.exit(1); }
  brtHour = Number(agoraBR.slice(0, 2));
}

let todayBR;
try {
  todayBR = dataEfetiva({ dateArg, dry: DRY, hoje: hojeBR });
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// Guarda de janela: cron do GitHub atrasa (às vezes horas). Se cair fora de 8-23h BRT,
// é atraso (ou madrugada): não publico, pra não pegar o dia errado. Dentro da janela,
// pickPostLocal resolve só os posts cujo horário (HH:MM) já chegou.
const janela = `${JANELA_BRT.de}-${JANELA_BRT.ate}h`;
if (!manual && !dentroDaJanela(brtHour)) {
  console.log(`Agora são ${agoraBR} BRT, fora da janela ${janela} (cron atrasou). Não publico. Nada a fazer.`);
  process.exit(0);
}
if (DRY && !argPost && !dentroDaJanela(brtHour)) console.log(`--dry: ${agoraBR} BRT está fora da janela ${janela}; no cron, este run não publicaria nada.`);

const IG_POLL_TIMEOUT = Number(IG_POLL_TIMEOUT_MS) || 10 * 60 * 1000;

const escolhido = pickPostLocal({ todayBR, agoraBR, arg: argPost });
const fontes = argPost ? [escolhido] : escolhido;
if (!fontes.length) { console.log(`Nenhum post agendado pra hoje (${todayBR}) até ${agoraBR} BRT. Nada a fazer.`); process.exit(0); }
if (!argPost) console.log(`${todayBR} ${agoraBR} BRT: ${fontes.length} post(s) do dia com horário já chegado.`);
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

// Resolve as URLs, loga e (fora do --dry) monta o container e publica. Devolve o media id.
async function publicar(post) {
  const { caption, images, video } = post;
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

  if (DRY) { console.log('--dry: resolvido, não publica.'); return null; }

  // aquece o CDN (vídeo e capa/imagens) antes de pedir qualquer container à Meta
  await aquecerCdn(videoUrl ? [videoUrl, urls[0]] : urls);

  // monta o container: REEL (vídeo), imagem única, ou carrossel; recria uma vez se der ERROR
  const maxPolls = videoUrl ? 40 : 20; // vídeo demora mais pra processar
  const criar = async () => {
    if (videoUrl) return (await graph(`${IG_USER_ID}/media`, { method: 'POST', params: paramsDoReel({ videoUrl, coverUrl: urls[0], caption }) })).id;
    if (urls.length === 1) return (await graph(`${IG_USER_ID}/media`, { method: 'POST', params: { image_url: urls[0], caption } })).id;
    const children = [];
    for (const u of urls) children.push((await graph(`${IG_USER_ID}/media`, { method: 'POST', params: { image_url: u, is_carousel_item: 'true' } })).id);
    return (await graph(`${IG_USER_ID}/media`, { method: 'POST', params: { media_type: 'CAROUSEL', caption, children: children.join(',') } })).id;
  };
  const containerId = await criarEPollar({ criar, graph, maxPolls, timeoutMs: IG_POLL_TIMEOUT });

  const pub = await graph(`${IG_USER_ID}/media_publish`, { method: 'POST', params: { creation_id: containerId } });
  return pub.id;
}

// Idempotência: publicarFila checa a legenda de cada post no feed antes de publicar (fonte da
// verdade = a própria conta). Dois runs seguidos no mesmo dia não duplicam; se a checagem
// falhar fora do --dry, o run para sem publicar este post nem os seguintes.
try {
  const { publicados, pulados } = await publicarFila({
    fontes, graph, igUserId: IG_USER_ID, dry: DRY,
    lerPost: (f) => JSON.parse(readFileSync(f, 'utf8')),
    publicar,
  });
  if (!DRY) console.log(`Fim do run: ${publicados.length} publicado(s), ${pulados.length} já no feed.`);
} catch (err) {
  if (!err.checagem) console.error('Falha ao publicar:', formatarErro(err));
  process.exit(1);
}
