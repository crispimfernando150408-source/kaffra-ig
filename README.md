# kaffra-ig

Publica os carrosséis da Kaffra no Instagram pelo GitHub Actions. A fila é a pasta `posts/`. Não há dashboard.

O cron dispara às 22:00 UTC (19h em Brasília), em minutos quebrados, na janela da noite. Se a mesma legenda já está no feed, não publica de novo. O token longo (60 dias) renova todo dia 1.

## Secrets

No repositório: Settings → Secrets and variables → Actions.

- `IG_ACCESS_TOKEN`: token longo do Instagram (Instagram Login).
- `IG_USER_ID`: id numérico da conta.
- `GH_PAT` (opcional): PAT com permissão de escrever secrets. Com ele, o refresh grava o token novo sozinho. Sem ele, o workflow imprime o token pra colar à mão.
- `IG_POLL_TIMEOUT_MS` (opcional, variable): timeout do processamento do container, em ms. Padrão 600000 (10 min).

Nada disso entra no git. Os nomes estão em `.env.example`.

## Testar sem publicar

```sh
IG_ACCESS_TOKEN=x IG_USER_ID=x node ig/publish-ci.mjs --dry --date 2026-09-22
```

`--date` só funciona junto com `--dry`. Sem `--date`, o dry usa o dia de hoje em Brasília. Testes: `node --test ig/publish-ci.test.mjs`.

## Adicionar um post

1. JPEGs 1080×1350 em `posts/<semana>/img/<slug>/01.jpg`, `02.jpg`, …
2. `posts/<semana>/post-<slug>.json` com `caption`, `images` (caminhos relativos) e `scheduleAt` em `YYYY-MM-DDTHH:MM:SS-03:00`, 19:00.
3. Commit. O push fica com quem confirma a visibilidade do repositório.

Reel: campo `video` com o mp4, e a capa é `images[0]`. Sem imagem, o primeiro quadro (`thumb_offset=0`).
