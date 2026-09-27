// Publica stories de imagem ou vídeo no Instagram (conta profissional), rodando no GitHub Actions.
// Uso: node ig/stories-ci.mjs <caminho-relativo-1.jpg|.mp4> [<caminho-2...> ...] [--dry]
// Imagem: container media_type=STORIES + image_url, servida por raw.githubusercontent.
// Vídeo (.mp4): container media_type=STORIES + video_url, servido por jsDelivr (raw.githubusercontent
// devolve octet-stream e o IG recusa; jsDelivr serve video/mp4 e só entrega até 20 MB).
// Cada story vira um container e é publicado em seguida.
// Uso na casa: as capas dos destaques (posts/destaques/*.jpg); o "Destacar" é feito no app.
import { criarGraph, ehVideoStory, formatarErro, paramsDaStory, pollContainer, urlDaStory } from './lib.mjs';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const arquivos = argv.filter((a) => !a.startsWith('--'));
const { IG_ACCESS_TOKEN, IG_USER_ID, GITHUB_REPOSITORY, GITHUB_REF_NAME } = process.env;
const BRANCH = GITHUB_REF_NAME || 'main';

if (!arquivos.length) { console.error('Uso: node ig/stories-ci.mjs <imagem.jpg|vídeo.mp4> [...] [--dry]'); process.exit(1); }
if (!IG_ACCESS_TOKEN || !IG_USER_ID) { console.error('Faltam Secrets IG_ACCESS_TOKEN / IG_USER_ID'); process.exit(1); }

const graph = criarGraph({ accessToken: IG_ACCESS_TOKEN });
let falhas = 0;
for (const arquivo of arquivos) {
  const video = ehVideoStory(arquivo);
  const url = urlDaStory({ arquivo, githubRepository: GITHUB_REPOSITORY, branch: BRANCH });
  console.log(`Story (${video ? 'vídeo' : 'imagem'}): ${arquivo} -> ${url}`);
  if (DRY) { console.log('  --dry: não publica.'); continue; }
  try {
    const params = paramsDaStory({ url, video });
    const { id: containerId } = await graph(`${IG_USER_ID}/media`, { method: 'POST', params });
    console.log('  container:', containerId);
    await pollContainer({ graph, containerId, maxPolls: video ? 40 : 20, timeoutMs: 5 * 60 * 1000 });
    const pub = await graph(`${IG_USER_ID}/media_publish`, { method: 'POST', params: { creation_id: containerId } });
    console.log('  PUBLICADO. media id:', pub.id);
  } catch (err) {
    falhas++;
    console.error('  Falha:', formatarErro(err));
  }
}
if (falhas) { console.error(`${falhas} story(ies) com falha.`); process.exit(1); }
console.log('Todos os stories publicados.');
