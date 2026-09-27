# Plano dos destaques de conteúdo

Seis destaques novos do Instagram da Kaffra, um vídeo/imagem por linha, na ordem em que devem
aparecer dentro de cada destaque (o primeiro publicado fica primeiro; o app não deixa reordenar
depois, então a ordem de publicação é a ordem final). Arquivos em
`posts/destaques-conteudo/<destaque>/`, prefixados `01-`, `02-`... Todo story é 1080×1920;
imagem JPEG q92; vídeo H.264 1080×1920, ≤ 60 s, ≤ 20 MB, áudio AAC (exceto o clipe de bastidores,
que já não tem trilha).

Comando de publicação: `gh workflow run "Publica stories (manual)" --repo
crispimfernando150408-source/kaffra-ig -f imagens="<lista>" -f dry=false`. Rodar um destaque por
vez (o workflow publica tudo que vier na lista, em sequência); a lista abaixo já está na ordem.
Antes de rodar de verdade, testar com `dry=true`.

## sobre

| ordem | arquivo | tipo | duração | tamanho |
|---|---|---|---|---|
| 1 | `01-marca-apple.mp4` | vídeo | 31,76 s | 4,40 MB |
| 2 | `02-o-k.jpg` | imagem | — | 0,05 MB |
| 3 | `03-o-repetitivo-fica.jpg` | imagem | — | 0,21 MB |

Fontes: Reel 04 "filme de marca" inteiro (`~/Kaffra/conteudo/entregas/2026-09-26/9x16-reels/04-marca-apple.mp4`,
já 1080×1920 H.264/AAC, copiado sem reprocessar); `out/12-o-k/01.png` e `out/11-o-repetitivo-fica/01.png`,
cada slide (1080×1350) centrado sobre fundo `#FDFDFC` 1080×1920, sem texto extra.

```sh
gh workflow run "Publica stories (manual)" --repo crispimfernando150408-source/kaffra-ig \
  -f imagens="posts/destaques-conteudo/sobre/01-marca-apple.mp4 posts/destaques-conteudo/sobre/02-o-k.jpg posts/destaques-conteudo/sobre/03-o-repetitivo-fica.jpg" \
  -f dry=false
```

## diagnostico

| ordem | arquivo | tipo | duração | tamanho |
|---|---|---|---|---|
| 1 | `01-diagnostico-linear.mp4` | vídeo | 30,88 s | 13,00 MB |
| 2 | `02-ponto-onde-tudo-espera-01.jpg` | imagem | — | 0,15 MB |
| 3 | `03-ponto-onde-tudo-espera-03.jpg` | imagem | — | 0,12 MB |
| 4 | `04-ponto-onde-tudo-espera-05.jpg` | imagem | — | 0,15 MB |
| 5 | `05-cinco-de-cada-cem-01.jpg` | imagem | — | 0,13 MB |
| 6 | `06-cinco-de-cada-cem-02.jpg` | imagem | — | 0,09 MB |
| 7 | `07-frase-sobre-foto.jpg` | imagem | — | 0,12 MB |

Fontes: Reel 05 inteiro (`05-diagnostico-linear.mp4`, já 1080×1920 H.264/AAC); slides 1, 3 e 5 de
`out/06-ponto-onde-tudo-espera/`; slides 1 e 2 de `out/09-cinco-de-cada-cem/`;
`out/10-frase-sobre-foto/01.png`. Slides centrados sobre `#FDFDFC` como no destaque "sobre".

```sh
gh workflow run "Publica stories (manual)" --repo crispimfernando150408-source/kaffra-ig \
  -f imagens="posts/destaques-conteudo/diagnostico/01-diagnostico-linear.mp4 posts/destaques-conteudo/diagnostico/02-ponto-onde-tudo-espera-01.jpg posts/destaques-conteudo/diagnostico/03-ponto-onde-tudo-espera-03.jpg posts/destaques-conteudo/diagnostico/04-ponto-onde-tudo-espera-05.jpg posts/destaques-conteudo/diagnostico/05-cinco-de-cada-cem-01.jpg posts/destaques-conteudo/diagnostico/06-cinco-de-cada-cem-02.jpg posts/destaques-conteudo/diagnostico/07-frase-sobre-foto.jpg" \
  -f dry=false
```

## agentes

| ordem | arquivo | tipo | duração | tamanho |
|---|---|---|---|---|
| 1 | `01-agentes-parte1.mp4` | vídeo | 46,60 s | 17,99 MB |
| 2 | `02-agentes-parte2.mp4` | vídeo | 19,94 s | 5,89 MB |

Fonte: Reel 01 "equipe de agentes" (`01-agentes.mp4`, 66,52 s), maior que o limite de 60 s do
story, cortado em duas partes no corte de cena marcado em
`~/Kaffra/conteudo/videos/kaffra-equipe/NOTAS.md` (rodada 9, barra de capítulos): fim da
demonstração do Beto / início da transição Beto → Ana, em **46,59 s**. Parte 1 = Lia + Beto
(0 → 46,60 s); parte 2 = Ana + fecho + frase final (46,60 s → fim). Reencodado (H.264 two-pass
~3,1 Mb/s + AAC 128 kb/s) só pra caber em 20 MB por parte; nada de conteúdo cortado no meio de
uma cena. Nada mais neste destaque.

```sh
gh workflow run "Publica stories (manual)" --repo crispimfernando150408-source/kaffra-ig \
  -f imagens="posts/destaques-conteudo/agentes/01-agentes-parte1.mp4 posts/destaques-conteudo/agentes/02-agentes-parte2.mp4" \
  -f dry=false
```

## automacoes

| ordem | arquivo | tipo | duração | tamanho |
|---|---|---|---|---|
| 1 | `01-automacoes.mp4` | vídeo | 37,64 s | 9,92 MB |
| 2 | `02-ctrl-c-ctrl-v-01.jpg` | imagem | — | 0,11 MB |
| 3 | `03-ctrl-c-ctrl-v-02.jpg` | imagem | — | 0,19 MB |
| 4 | `04-ctrl-c-ctrl-v-04.jpg` | imagem | — | 0,10 MB |

Fontes: Reel 02 inteiro (`02-automacoes.mp4`, já 1080×1920 H.264/AAC); slides 1, 2 e 4 de
`out/07-ctrl-c-ctrl-v/`.

```sh
gh workflow run "Publica stories (manual)" --repo crispimfernando150408-source/kaffra-ig \
  -f imagens="posts/destaques-conteudo/automacoes/01-automacoes.mp4 posts/destaques-conteudo/automacoes/02-ctrl-c-ctrl-v-01.jpg posts/destaques-conteudo/automacoes/03-ctrl-c-ctrl-v-02.jpg posts/destaques-conteudo/automacoes/04-ctrl-c-ctrl-v-04.jpg" \
  -f dry=false
```

## sistemas

| ordem | arquivo | tipo | duração | tamanho |
|---|---|---|---|---|
| 1 | `01-sistemas.mp4` | vídeo | 37,04 s | 10,00 MB |
| 2 | `02-roupa-pronta-01.jpg` | imagem | — | 0,13 MB |
| 3 | `03-roupa-pronta-02.jpg` | imagem | — | 0,15 MB |
| 4 | `04-roupa-pronta-04.jpg` | imagem | — | 0,14 MB |

Fontes: Reel 03 inteiro (`03-sistemas.mp4`, já 1080×1920 H.264/AAC); slides 1, 2 e 4 de
`out/08-roupa-pronta/`.

```sh
gh workflow run "Publica stories (manual)" --repo crispimfernando150408-source/kaffra-ig \
  -f imagens="posts/destaques-conteudo/sistemas/01-sistemas.mp4 posts/destaques-conteudo/sistemas/02-roupa-pronta-01.jpg posts/destaques-conteudo/sistemas/03-roupa-pronta-02.jpg posts/destaques-conteudo/sistemas/04-roupa-pronta-04.jpg" \
  -f dry=false
```

## bastidores

| ordem | arquivo | tipo | duração | tamanho |
|---|---|---|---|---|
| 1 | `01-storyboard-filme-marca.jpg` | imagem | — | 0,25 MB |
| 2 | `02-leva-6c.jpg` | imagem | — | 0,14 MB |
| 3 | `03-folha-14-pontos-sistemas.jpg` | imagem | — | 0,11 MB |
| 4 | `04-direcao-contato-3d.jpg` | imagem | — | 0,06 MB |
| 5 | `05-leva-5.mp4` | vídeo | 43,40 s | 18,43 MB |

Fontes: as 4 fotos de bastidor (`kaffra-marca-apple/comparacao/r1/storyboard.jpg`,
`motion/renders/leva-6c.jpg`, `kaffra-sistemas/comparacao/r1/folha-14-pontos-9x16.jpg`,
`perfil-instagram/2026-09-26/destaques/premium/_direcao.jpg` — o render já existente do
`assets/3d/contato.html`, reaproveitado em vez de renderizar de novo), cada uma ajustada (contida,
sem cortar) em 9:16 sobre fundo `#0B0A08` com um rótulo mono pequeno em quase branco (`#F2F1EC`,
SF Mono) no rodapé: "storyboard do filme de marca", "teste de motion: leva 6c", "conferência: 14
pontos do vídeo sistemas", "direção de arte: cena 3d do contato". O clipe `motion/renders/leva-5.mp4`
(43,4 s, já sem trilha de áudio) reencodado (H.264 two-pass ~3,5 Mb/s, mudo) só pra caber em 20 MB;
não precisou cortar tempo porque já está abaixo de 59 s.

```sh
gh workflow run "Publica stories (manual)" --repo crispimfernando150408-source/kaffra-ig \
  -f imagens="posts/destaques-conteudo/bastidores/01-storyboard-filme-marca.jpg posts/destaques-conteudo/bastidores/02-leva-6c.jpg posts/destaques-conteudo/bastidores/03-folha-14-pontos-sistemas.jpg posts/destaques-conteudo/bastidores/04-direcao-contato-3d.jpg posts/destaques-conteudo/bastidores/05-leva-5.mp4" \
  -f dry=false
```

## Verificação: `node ig/stories-ci.mjs <todos os arquivos> --dry`

Rodado local com `GITHUB_REPOSITORY=crispimfernando150408-source/kaffra-ig`,
`GITHUB_REF_NAME=main` e tokens falsos (`IG_ACCESS_TOKEN=faketoken IG_USER_ID=123456`), passando
os 25 arquivos dos seis destaques em sequência (a ordem acima). Saída completa:

```
Story (vídeo): posts/destaques-conteudo/sobre/01-marca-apple.mp4 -> https://cdn.jsdelivr.net/gh/crispimfernando150408-source/kaffra-ig@main/posts/destaques-conteudo/sobre/01-marca-apple.mp4
  --dry: não publica.
Story (imagem): posts/destaques-conteudo/sobre/02-o-k.jpg -> https://raw.githubusercontent.com/crispimfernando150408-source/kaffra-ig/main/posts/destaques-conteudo/sobre/02-o-k.jpg
  --dry: não publica.
Story (imagem): posts/destaques-conteudo/sobre/03-o-repetitivo-fica.jpg -> https://raw.githubusercontent.com/crispimfernando150408-source/kaffra-ig/main/posts/destaques-conteudo/sobre/03-o-repetitivo-fica.jpg
  --dry: não publica.
Story (vídeo): posts/destaques-conteudo/diagnostico/01-diagnostico-linear.mp4 -> https://cdn.jsdelivr.net/gh/crispimfernando150408-source/kaffra-ig@main/posts/destaques-conteudo/diagnostico/01-diagnostico-linear.mp4
  --dry: não publica.
Story (imagem): posts/destaques-conteudo/diagnostico/02-ponto-onde-tudo-espera-01.jpg -> https://raw.githubusercontent.com/crispimfernando150408-source/kaffra-ig/main/posts/destaques-conteudo/diagnostico/02-ponto-onde-tudo-espera-01.jpg
  --dry: não publica.
Story (imagem): posts/destaques-conteudo/diagnostico/03-ponto-onde-tudo-espera-03.jpg -> https://raw.githubusercontent.com/crispimfernando150408-source/kaffra-ig/main/posts/destaques-conteudo/diagnostico/03-ponto-onde-tudo-espera-03.jpg
  --dry: não publica.
Story (imagem): posts/destaques-conteudo/diagnostico/04-ponto-onde-tudo-espera-05.jpg -> https://raw.githubusercontent.com/crispimfernando150408-source/kaffra-ig/main/posts/destaques-conteudo/diagnostico/04-ponto-onde-tudo-espera-05.jpg
  --dry: não publica.
Story (imagem): posts/destaques-conteudo/diagnostico/05-cinco-de-cada-cem-01.jpg -> https://raw.githubusercontent.com/crispimfernando150408-source/kaffra-ig/main/posts/destaques-conteudo/diagnostico/05-cinco-de-cada-cem-01.jpg
  --dry: não publica.
Story (imagem): posts/destaques-conteudo/diagnostico/06-cinco-de-cada-cem-02.jpg -> https://raw.githubusercontent.com/crispimfernando150408-source/kaffra-ig/main/posts/destaques-conteudo/diagnostico/06-cinco-de-cada-cem-02.jpg
  --dry: não publica.
Story (imagem): posts/destaques-conteudo/diagnostico/07-frase-sobre-foto.jpg -> https://raw.githubusercontent.com/crispimfernando150408-source/kaffra-ig/main/posts/destaques-conteudo/diagnostico/07-frase-sobre-foto.jpg
  --dry: não publica.
Story (vídeo): posts/destaques-conteudo/agentes/01-agentes-parte1.mp4 -> https://cdn.jsdelivr.net/gh/crispimfernando150408-source/kaffra-ig@main/posts/destaques-conteudo/agentes/01-agentes-parte1.mp4
  --dry: não publica.
Story (vídeo): posts/destaques-conteudo/agentes/02-agentes-parte2.mp4 -> https://cdn.jsdelivr.net/gh/crispimfernando150408-source/kaffra-ig@main/posts/destaques-conteudo/agentes/02-agentes-parte2.mp4
  --dry: não publica.
Story (vídeo): posts/destaques-conteudo/automacoes/01-automacoes.mp4 -> https://cdn.jsdelivr.net/gh/crispimfernando150408-source/kaffra-ig@main/posts/destaques-conteudo/automacoes/01-automacoes.mp4
  --dry: não publica.
Story (imagem): posts/destaques-conteudo/automacoes/02-ctrl-c-ctrl-v-01.jpg -> https://raw.githubusercontent.com/crispimfernando150408-source/kaffra-ig/main/posts/destaques-conteudo/automacoes/02-ctrl-c-ctrl-v-01.jpg
  --dry: não publica.
Story (imagem): posts/destaques-conteudo/automacoes/03-ctrl-c-ctrl-v-02.jpg -> https://raw.githubusercontent.com/crispimfernando150408-source/kaffra-ig/main/posts/destaques-conteudo/automacoes/03-ctrl-c-ctrl-v-02.jpg
  --dry: não publica.
Story (imagem): posts/destaques-conteudo/automacoes/04-ctrl-c-ctrl-v-04.jpg -> https://raw.githubusercontent.com/crispimfernando150408-source/kaffra-ig/main/posts/destaques-conteudo/automacoes/04-ctrl-c-ctrl-v-04.jpg
  --dry: não publica.
Story (vídeo): posts/destaques-conteudo/sistemas/01-sistemas.mp4 -> https://cdn.jsdelivr.net/gh/crispimfernando150408-source/kaffra-ig@main/posts/destaques-conteudo/sistemas/01-sistemas.mp4
  --dry: não publica.
Story (imagem): posts/destaques-conteudo/sistemas/02-roupa-pronta-01.jpg -> https://raw.githubusercontent.com/crispimfernando150408-source/kaffra-ig/main/posts/destaques-conteudo/sistemas/02-roupa-pronta-01.jpg
  --dry: não publica.
Story (imagem): posts/destaques-conteudo/sistemas/03-roupa-pronta-02.jpg -> https://raw.githubusercontent.com/crispimfernando150408-source/kaffra-ig/main/posts/destaques-conteudo/sistemas/03-roupa-pronta-02.jpg
  --dry: não publica.
Story (imagem): posts/destaques-conteudo/sistemas/04-roupa-pronta-04.jpg -> https://raw.githubusercontent.com/crispimfernando150408-source/kaffra-ig/main/posts/destaques-conteudo/sistemas/04-roupa-pronta-04.jpg
  --dry: não publica.
Story (imagem): posts/destaques-conteudo/bastidores/01-storyboard-filme-marca.jpg -> https://raw.githubusercontent.com/crispimfernando150408-source/kaffra-ig/main/posts/destaques-conteudo/bastidores/01-storyboard-filme-marca.jpg
  --dry: não publica.
Story (imagem): posts/destaques-conteudo/bastidores/02-leva-6c.jpg -> https://raw.githubusercontent.com/crispimfernando150408-source/kaffra-ig/main/posts/destaques-conteudo/bastidores/02-leva-6c.jpg
  --dry: não publica.
Story (imagem): posts/destaques-conteudo/bastidores/03-folha-14-pontos-sistemas.jpg -> https://raw.githubusercontent.com/crispimfernando150408-source/kaffra-ig/main/posts/destaques-conteudo/bastidores/03-folha-14-pontos-sistemas.jpg
  --dry: não publica.
Story (imagem): posts/destaques-conteudo/bastidores/04-direcao-contato-3d.jpg -> https://raw.githubusercontent.com/crispimfernando150408-source/kaffra-ig/main/posts/destaques-conteudo/bastidores/04-direcao-contato-3d.jpg
  --dry: não publica.
Story (vídeo): posts/destaques-conteudo/bastidores/05-leva-5.mp4 -> https://cdn.jsdelivr.net/gh/crispimfernando150408-source/kaffra-ig@main/posts/destaques-conteudo/bastidores/05-leva-5.mp4
  --dry: não publica.
Todos os stories publicados.
```

## Nota sobre `node --test ig/`

Neste Node (v24.18.0), `node --test ig/` literalmente falha (`Cannot find module '.../ig'`): esta
versão trata um diretório passado como argumento posicional como um módulo a dar `require`, não
como raiz de busca — reproduzível até num diretório vazio fora deste repo, não é bug do código.
`node --test` (sem argumento, descoberta automática a partir da raiz do repo) e `node --test
ig/*.test.mjs` funcionam e rodam os 20 testes (13 de `publish-ci.test.mjs` + 7 de
`stories-ci.test.mjs`), todos passando.
