# Deploy no EasyPanel

O Dockerfile da raiz compila frontend e backend. A API serve também a interface React na mesma origem, com suporte aos links diretos das telas. Use um serviço App e um PostgreSQL.

1. Crie um PostgreSQL no EasyPanel (ou use um banco existente acessível pelo servidor). Copie a URL interna de conexão.
2. Crie um serviço **App**, selecione a origem Git/GitHub, informe o repositório e a branch `main`.
3. Use a raiz do repositório como **Build Path** (`/`) e o builder **Dockerfile**, caminho `Dockerfile`.
4. Configure as variáveis abaixo no ambiente do serviço. Não coloque credenciais no repositório nem em argumentos de build.
5. Configure um domínio HTTPS com destino HTTP na porta **3333** do container. Use o mesmo domínio em `FRONTEND_URL`, sem barra no final.
6. Faça o deploy. O processo aplica `prisma migrate deploy` antes de iniciar a aplicação; se a migração falhar, a aplicação não inicia. Para banco existente, faça backup antes do primeiro deploy.
7. No terminal do serviço, execute uma vez `npm run prisma:seed:prod -w backend` para criar o administrador. Esse comando também redefine a senha de um administrador existente com o mesmo e-mail; execute novamente somente quando desejar essa atualização.
8. Abra o domínio e entre com `ADMIN_EMAIL` e `ADMIN_PASSWORD`.

```dotenv
NODE_ENV=production
PORT=3333
DATABASE_URL=postgresql://USUARIO:SENHA@HOST_INTERNO:5432/BANCO?schema=public
FRONTEND_URL=https://comercial.seudominio.com.br
COOKIE_SECURE=true
ADMIN_NAME=Administrador
ADMIN_EMAIL=admin@seudominio.com.br
ADMIN_PASSWORD=SUBSTITUA_POR_UMA_SENHA_FORTE
JWT_SECRET=SUBSTITUA_POR_UM_SEGREDO_ALEATORIO_DE_PELO_MENOS_32_CARACTERES
SIRIUS_TIMEOUT_MS=20000
QUEDA_PERCENTUAL=25
QUEDA_VOLUME_MINIMO=100
```

Caracteres especiais do usuário/senha na URL PostgreSQL devem ser codificados para URL. Para gerar um JWT_SECRET, execute localmente `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"` e copie o resultado para o painel.

O endpoint `/api/health` verifica se a API responde, sem testar o banco. Confira também o login após o deploy. Não é necessário volume no App: os dados ficam no PostgreSQL. Configure persistência e backup no serviço de banco.

Mantenha uma réplica: a sessão do Sírius fica em memória. Após reiniciar ou fazer deploy, reconecte ao Sírius pela interface. A URL do Sírius pode ser informada na tela de conexão ou por `SIRIUS_DEFAULT_URL`.

O `docker-compose.yml` existente é apenas para o PostgreSQL de desenvolvimento local. No EasyPanel, use o Dockerfile da raiz.

Documentação oficial: https://easypanel.io/docs/builders e https://easypanel.io/docs/services/app.
