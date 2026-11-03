# Publicar o Agency OS online (Neon + Vercel)

Tempo estimado: 20 a 30 minutos. Tudo pelo navegador, sem instalar nada.
Custo: planos gratuitos da Neon e da Vercel são suficientes para a demonstração.

> **Importante:** este ambiente é de **demonstração com dados fictícios**. Não cadastre clientes reais nem dados financeiros reais antes de ativarmos o 2FA, os serviços de produção (R2, Resend, Inngest, Sentry) e o domínio próprio.

---

## Passo 1 — Banco de dados na Neon

1. Acesse **https://neon.tech** e clique em **Sign up** → entre com a sua conta do **GitHub**.
2. Crie um projeto:
   - **Project name:** `agency-os`
   - **Postgres version:** 16
   - **Region:** `AWS São Paulo (sa-east-1)` (ou a mais próxima)
3. No painel do projeto, clique em **Connect**. Aparece um endereço parecido com:
   `postgresql://neondb_owner:SENHA@ep-xxxx-123456.sa-east-1.aws.neon.tech/neondb?sslmode=require`
4. Anote **duas versões** desse endereço:
   - **A) Endereço do dono (direto):** com a opção **Connection pooling DESLIGADA**. Copie como está.
   - **B) Endereço da aplicação (pooled):** ligue **Connection pooling** (o host ganha `-pooler`). Depois **troque o usuário e a senha** por `aos_app` e uma senha que você inventar:
     `postgresql://aos_app:SENHA_QUE_VOCE_INVENTOU@ep-xxxx-123456-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require`

   A senha inventada (sem espaços nem `@`, `:` ou `/`) também será o segredo `APP_DB_PASSWORD`.

## Passo 2 — Segredos no GitHub

No repositório **https://github.com/suportesistemaaria-byte/agency-os**:
**Settings → Secrets and variables → Actions → New repository secret**. Crie:

| Nome                 | Valor                                                                        |
| -------------------- | ---------------------------------------------------------------------------- |
| `DATABASE_ADMIN_URL` | endereço **A** (dono, direto)                                                |
| `DATABASE_URL`       | endereço **B** (aos_app, pooled)                                             |
| `APP_DB_PASSWORD`    | a senha que você inventou para `aos_app`                                     |
| `DEMO_PASSWORD`      | a senha que os usuários de demonstração vão usar (não use `demo1234` online) |

## Passo 3 — Preparar o banco (um clique)

No GitHub: **Actions → Preparar banco (Neon) → Run workflow** (deixe "Carregar os dados de demonstração" marcado) → **Run workflow**.
Em 2 a 4 minutos fica verde. Isso cria o papel da aplicação, aplica as migrações e carrega a demonstração fictícia.

## Passo 4 — Hospedar na Vercel

1. Acesse **https://vercel.com** → **Sign up** → entre com o **GitHub**.
2. **Add New… → Project → Import** o repositório `agency-os` (autorize o acesso se pedir).
3. Em **Root Directory**, clique em **Edit** e escolha **`apps/web`**.
4. Em **Environment Variables**, adicione:

| Nome                 | Valor                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------- |
| `APP_ENV`            | `preview`                                                                             |
| `APP_URL`            | `https://agency-os.vercel.app` (ajuste no passo 5 se o endereço for outro)            |
| `DATABASE_URL`       | endereço **B**                                                                        |
| `DATABASE_ADMIN_URL` | endereço **A**                                                                        |
| `BETTER_AUTH_SECRET` | um texto aleatório com 32+ caracteres (gere em https://generate-secret.vercel.app/32) |
| `CRON_SECRET`        | outro texto aleatório (mesmo gerador)                                                 |
| `EVENT_DISPATCH`     | `local`                                                                               |
| `STORAGE_DRIVER`     | `db`                                                                                  |

5. Clique em **Deploy**. Ao terminar, copie o endereço que a Vercel mostrar (ex.: `https://agency-os-xxxx.vercel.app`).
   Se for diferente do `APP_URL` que você colocou: **Settings → Environment Variables → APP_URL** → cole o endereço certo → **Deployments → ⋯ → Redeploy**.

## Passo 5 — Abrir

- **Equipe:** `https://SEU-ENDERECO.vercel.app` → `manuella@demo.local` + a senha do `DEMO_PASSWORD`.
- **Portal do cliente (celular):** `https://SEU-ENDERECO.vercel.app/portal` → `contato@cafeaurora.demo.local` + a mesma senha.
- Outros perfis (designer, comercial, financeiro…) estão em `docs/CHECKPOINT-1.md`.

---

## Como funciona neste ambiente (o que muda em relação ao local)

| Tema                                             | Na demonstração online                                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Arquivos (artes)                                 | guardados no próprio Postgres (até 25 MB por arquivo); o R2 entra depois                                    |
| Eventos e automações                             | processados ao fim de cada ação (sem fila externa); o Inngest entra depois                                  |
| Rotinas (SLA, atrasos, mensalidades, renovações) | Vercel Cron 1× por dia às 08:00 (plano gratuito). Para a cada 5 min, plano Pro ou Inngest                   |
| E-mail (recuperação de senha)                    | não é enviado: aparece em **Vercel → Logs**. Resend entra depois                                            |
| Migrações futuras                                | a cada push na `main`, o workflow "Migrate production" aplica as novas migrações (usa `DATABASE_ADMIN_URL`) |

## Problemas comuns

- **Erro ao entrar / "Invalid origin":** o `APP_URL` precisa ser exatamente o endereço aberto no navegador (com `https://`, sem `/` no fim). Corrija e faça **Redeploy**.
- **Workflow "Preparar banco" vermelho em "Conferir segredos":** falta algum segredo do passo 2.
- **Erro de senha do `aos_app`:** a senha no endereço B tem que ser a mesma do `APP_DB_PASSWORD`. Ajuste e rode o workflow de novo (ele é seguro para repetir; os dados de demonstração não duplicam).
- **"Muitas tentativas":** proteção de login; aguarde alguns segundos.
