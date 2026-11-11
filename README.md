# kaffra-ig

Publica os carrosséis da Kaffra no Instagram pelo GitHub Actions. A fila é a pasta `posts/`. Não há dashboard.

O cron dispara de hora em hora, das 8h às 22h BRT, no minuto 13 (08:13, 09:13, …, 22:13;
o GitHub atrasa ou descarta cron em hora cheia). A guarda de horário só aceita 8–23h BRT;
fora disso (cron atrasado de madrugada) não publica. Cada run publica, em ordem de horário,
todos os posts do dia cujo `scheduleAt` (HH:MM em BRT) já chegou: um post das 15:00 sai no
run das 15:13; um das 15:30 espera o das 16:13. Se um cron falhar, o da hora seguinte pega o
que ficou. Antes de cada post, o run olha as 25 mídias mais recentes do feed: se a mesma
legenda já está lá, não publica de novo (é isso que impede dois runs seguidos de duplicarem;
se a checagem falhar, o run para sem publicar). Se um post falhar ao publicar (imagem 404,
container em ERROR), o run segue com os outros e termina com erro; o run seguinte tenta o que
falhou de novo. Um run por vez (`concurrency` no workflow): o run em andamento nunca é
cancelado, mas na fila fica só um pendente (um disparo manual pendente pode ser substituído
por um cron). Entre duas publicações do mesmo run, 60 s de espera; cada run tem até 120 min.

Para muitos posts por dia (meta: 15 por conta, sendo 10 no feed e 3 Reels por esta fila e
2 stories, que hoje são manuais):

- `scheduleAt` entre 08:00 e 22:00, sempre com `-03:00`, de preferência em hora cheia. Post
  depois das 22:13 não sai (não há run depois disso no dia), e post de um dia que passou não
  sai mais. O teste `posts/: scheduleAt...` recusa offset diferente e horário fora disso.
- Um post das 22:00 só tem a chance do run das 22:13; o resto do dia tem a do run seguinte.
- Legendas diferentes entre si: duas iguais no mesmo dia, a segunda é pulada.
- A checagem olha só as 25 mídias mais recentes: com mais de 25 posts por dia (ou muito post
  manual no meio), um post antigo do dia pode sair outra vez.
- Limite da Meta: 50 posts publicados pela API por conta em 24 h (carrossel conta como 1).
  A documentação de publicação cita 100 numa seção e 50 em outra; vale o menor.

Stories não seguem esse esquema: `stories.yml` é só manual (`workflow_dispatch`, caminhos das
imagens ou vídeos na mão), sem cron, sem fila com horário e sem checagem de duplicata.

O token longo (60 dias) renova todo dia 1.

## Secrets

No repositório: Settings → Secrets and variables → Actions.

- `IG_ACCESS_TOKEN`: token longo do Instagram (Instagram Login).
- `IG_USER_ID`: id numérico da conta.
- `GH_PAT`: PAT com permissão de escrever secrets. Com ele, o refresh grava o token novo sozinho. Sem ele, o job de refresh falha (nunca imprime o token).
- `IG_POLL_TIMEOUT_MS` (opcional, variable): timeout do processamento do container, em ms. Padrão 600000 (10 min).

Nada disso entra no git. Os nomes estão em `.env.example`.

## Testar sem publicar

```sh
IG_ACCESS_TOKEN=x IG_USER_ID=x node ig/publish-ci.mjs --dry --date 2026-09-22
```

`--date` só funciona junto com `--dry`. Sem `--date`, o dry usa o dia de hoje em Brasília.
`IG_FAKE_HOUR` (também só com `--dry`) simula a hora BRT, `19` (19:00) ou `19:30`, pra testar
quais posts do dia já teriam "chegado":

```sh
IG_ACCESS_TOKEN=x IG_USER_ID=x IG_FAKE_HOUR=19:13 node ig/publish-ci.mjs --dry --date 2026-11-11
```

Testes: `node --test` na raiz.

## Adicionar um post

1. JPEGs 1080×1350 em `posts/<semana>/img/<slug>/01.jpg`, `02.jpg`, …
2. `posts/<semana>/post-<slug>.json` com `caption`, `images` (caminhos relativos) e `scheduleAt` em `YYYY-MM-DDTHH:MM:SS-03:00`, entre 08:00 e 22:00.
3. Commit. O push fica com quem confirma a visibilidade do repositório.

Reel: campo `video` com o mp4, e a capa é `images[0]`. Sem imagem, o primeiro quadro (`thumb_offset=0`).

## Fila arquivada

`posts/_arquivo/semana39/` — fila original (5 carrosséis sobre o processo da
Kaffra). Substituída em 26/09/2026 pela fila atual (`posts/semana40/` a
`posts/semana43/`), decisão do Fernando de não falar do processo da empresa
e usar a série dos vídeos. Fica arquivada, sem uso.
