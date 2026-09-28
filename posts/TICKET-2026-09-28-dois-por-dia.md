# Ticket 2026-09-28: dois posts por dia, a partir de hoje

Decisão do Fernando em 2026-09-28: "vamos postar a partir de hoje, 2 conteúdos por dia". A fila de 12 peças (`posts/FILA-2026-09-29.md`) passa a sair em 6 dias, de 28/09 a 03/10, dois horários por dia: **12h** e **19h** BRT. Hoje (28/09) o meio-dia já passou: os dois de hoje saem às **19h** e **21h**.

## Ordem nova

Os Reels 01-agentes, 02-automacoes e 03-sistemas estão sendo refeitos (sai o trilho da base); por isso ficam de 30/09 em diante e os arquivos deles serão trocados antes da data. 04 e 05 não mudam.

| Data | Hora | Peça | Tipo |
|---|---|---|---|
| 2026-09-28 seg | 19h | `09-cinco-de-cada-cem` | Carrossel |
| 2026-09-28 seg | 21h | `imagem-c-o-k` | Imagem |
| 2026-09-29 ter | 12h | `imagem-a-frase-sobre-foto` | Imagem |
| 2026-09-29 ter | 19h | `08-roupa-pronta` | Carrossel |
| 2026-09-30 qua | 12h | `imagem-b-o-repetitivo` | Imagem |
| 2026-09-30 qua | 19h | `01-agentes` | Reel |
| 2026-10-01 qui | 12h | `07-ctrl-c-ctrl-v` | Carrossel |
| 2026-10-01 qui | 19h | `05-diagnostico-linear` | Reel |
| 2026-10-02 sex | 12h | `06-ponto-onde-tudo-espera` | Carrossel |
| 2026-10-02 sex | 19h | `03-sistemas` | Reel |
| 2026-10-03 sáb | 12h | `04-marca-apple` | Reel |
| 2026-10-03 sáb | 19h | `02-automacoes` | Reel |

## O que mudar no código (com testes em `node --test`)

1. **`pickPostLocal` em `ig/lib.mjs`** passa a devolver **todos** os posts do dia cujo horário em `scheduleAt` já chegou (hora BRT do `scheduleAt` ≤ hora atual), em ordem de horário. Assinatura nova recebe `brtHour`. Manter compatível com o `arg` explícito.
2. **`ig/publish-ci.mjs`**: publica cada post da lista que ainda não saiu. "Já saiu" = a checagem de duplicado que já existe (legenda igual nos últimos media da conta); se a checagem falhar por erro de API, **não** publica e sai com aviso (nunca arriscar duplicado). Entre dois posts no mesmo run, esperar 60 s.
3. **Janela**: a guarda passa de 18–23h para **11–23h**. Um post de 12h que caia num run das 19h ainda sai (é a lista de "já chegou"), o que é o comportamento desejado quando o cron atrasa.
4. **Crons em `.github/workflows/publish.yml`**: acrescentar janelas do meio-dia com os mesmos minutos quebrados: `7 15 * * *` (12:07 BRT), `31 15`, `52 15`, `14 16`, `39 16` (UTC). Manter as da noite e acrescentar `4 0 * * *` (21:04 BRT) para o segundo post de hoje.
5. Mover/renomear os `post-*.json` conforme a tabela: `scheduleAt` com a hora certa e fuso `-03:00`. As pastas `semana41`, `42` e `43` ficam vazias (apagar) e tudo vai para `semana40`. Não mexer nas legendas nem nas imagens.
6. Reescrever `posts/FILA-2026-09-29.md` como `posts/FILA-2026-09-28.md` com a tabela acima e os 12 dry-runs (`--dry --date` só simula a data; simule também a hora com uma variável de ambiente nova `IG_FAKE_HOUR` que só vale com `--dry`).
7. `node --test` verde; `node ig/publish-ci.mjs --dry --date 2026-09-28` com `IG_FAKE_HOUR=21` tem que resolver os dois posts de hoje, e com `IG_FAKE_HOUR=19` só o primeiro.

## Restrições

Sem git (o coordenador commita), sem publicar de verdade, sem tocar em `ig/stories-ci.mjs`, sem tocar nos segredos. Nada de `pkill`. Ao terminar, responda com: lista de arquivos alterados, saída do `node --test` e dos dois dry-runs de hoje, e o que ficou fora.
