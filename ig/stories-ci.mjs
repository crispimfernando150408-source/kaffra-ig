// Publica stories de imagem no Instagram (conta profissional), rodando no GitHub Actions.
// Uso: node ig/stories-ci.mjs <caminho-relativo-1.jpg> [<caminho-2.jpg> ...] [--dry]
// As imagens precisam estar no repositório (servidas por raw.githubusercontent).
// Cada story vira um container media_type=STORIES e é publicado em seguida.
// Uso na casa: as capas dos destaques (posts/destaques/*.jpg); o "Destacar" é feito no app.
import { criarGraph, formatarErro, pollContainer } from './lib.mjs';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const arquivos = argv.filter((a) => !a.startsWith('--'));
const { IG_ACCESS_TOKEN, IG_USER_ID, GITHUB_REPOSITORY, GITHUB_REF_NAME } = process.env;
const BRANCH = GITHUB_REF_NAME || 'main';

if (!arquivos.length) { console.error('Uso: node ig/stories-ci.mjs <imagem.jpg> [...] [--dry]'); process.exit(1); }
if (!IG_ACCESS_TOKEN || !IG_USER_ID) { console.error('Faltam Secrets IG_ACCESS_TOKEN / IG_USER_ID'); process.exit(1); }

const urlDe = (p) => GITHUB_REPOSITORY
  ? `https://raw.githubusercontent.com/${GITHUB_REPOSITORY}/${BRANCH}/${p}`
  : p;

const graph = criarGraph({ accessToken: IG_ACCESS_TOKEN });
let falhas = 0;
for (const arquivo of arquivos) {
  const url = urlDe(arquivo);
  console.log(`Story: ${arquivo} -> ${url}`);
  if (DRY) { console.log('  --dry: não publica.'); continue; }
  try {
    const { id: containerId } = await graph(`${IG_USER_ID}/media`, {
      method: 'POST',
      params: { media_type: 'STORIES', image_url: url },
    });
    console.log('  container:', containerId);
    await pollContainer({ graph, containerId, maxPolls: 20, timeoutMs: 5 * 60 * 1000 });
    const pub = await graph(`${IG_USER_ID}/media_publish`, { method: 'POST', params: { creation_id: containerId } });
    console.log('  PUBLICADO. media id:', pub.id);
  } catch (err) {
    falhas++;
    console.error('  Falha:', formatarErro(err));
  }
}
if (falhas) { console.error(`${falhas} story(ies) com falha.`); process.exit(1); }
console.log('Todos os stories publicados.');
