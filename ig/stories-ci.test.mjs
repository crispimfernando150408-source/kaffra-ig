// Testes das funções extraídas pra ig/lib.mjs usadas pelo stories-ci.mjs, sem rede real.
// stories-ci.mjs em si é um script de topo de nível (efeitos colaterais no import); a lógica
// que importa (imagem × vídeo, escolha de URL, parâmetros do container) mora em lib.mjs e é
// testada aqui direto, no mesmo estilo de publish-ci.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ehVideoStory, paramsDaStory, urlDaStory } from './lib.mjs';

// ---------- ehVideoStory ----------

test('ehVideoStory reconhece .mp4 (e ignora maiúsculas) e recusa imagem', () => {
  assert.equal(ehVideoStory('posts/destaques-conteudo/agentes/01.mp4'), true);
  assert.equal(ehVideoStory('posts/destaques-conteudo/agentes/01.MP4'), true);
  assert.equal(ehVideoStory('posts/destaques-conteudo/sobre/01.jpg'), false);
  assert.equal(ehVideoStory('posts/destaques-conteudo/sobre/01.png'), false);
});

// ---------- urlDaStory ----------

test('urlDaStory manda imagem pro raw.githubusercontent', () => {
  const url = urlDaStory({
    arquivo: 'posts/destaques-conteudo/sobre/02-o-k.jpg',
    githubRepository: 'crispimfernando150408-source/kaffra-ig',
    branch: 'main',
  });
  assert.equal(url, 'https://raw.githubusercontent.com/crispimfernando150408-source/kaffra-ig/main/posts/destaques-conteudo/sobre/02-o-k.jpg');
});

test('urlDaStory manda vídeo pro jsDelivr (raw serve octet-stream e o IG recusa)', () => {
  const url = urlDaStory({
    arquivo: 'posts/destaques-conteudo/agentes/01-agentes-parte1.mp4',
    githubRepository: 'crispimfernando150408-source/kaffra-ig',
    branch: 'main',
  });
  assert.equal(url, 'https://cdn.jsdelivr.net/gh/crispimfernando150408-source/kaffra-ig@main/posts/destaques-conteudo/agentes/01-agentes-parte1.mp4');
});

test('urlDaStory usa a branch informada', () => {
  const url = urlDaStory({ arquivo: 'a.mp4', githubRepository: 'dono/repo', branch: 'dev' });
  assert.equal(url, 'https://cdn.jsdelivr.net/gh/dono/repo@dev/a.mp4');
});

test('urlDaStory sem GITHUB_REPOSITORY devolve o caminho como está (dry local)', () => {
  assert.equal(urlDaStory({ arquivo: 'posts/x.jpg', githubRepository: undefined }), 'posts/x.jpg');
  assert.equal(urlDaStory({ arquivo: 'posts/x.mp4', githubRepository: undefined }), 'posts/x.mp4');
});

// ---------- paramsDaStory ----------

test('paramsDaStory de imagem manda image_url e não video_url', () => {
  const params = paramsDaStory({ url: 'https://raw.example/a.jpg', video: false });
  assert.deepEqual(params, { media_type: 'STORIES', image_url: 'https://raw.example/a.jpg' });
});

test('paramsDaStory de vídeo manda video_url e não image_url', () => {
  const params = paramsDaStory({ url: 'https://cdn.example/a.mp4', video: true });
  assert.deepEqual(params, { media_type: 'STORIES', video_url: 'https://cdn.example/a.mp4' });
});
