# Gerente Comercial IA — MVP

Plataforma B2B para sincronizar vendas do Space Sírius, detectar recompras atrasadas e organizar oportunidades comerciais. O frontend nunca recebe credenciais nem o token do Sírius. As integrações são iniciadas pelo backend. Consultas e sincronizações usam endpoints de leitura; a criação de agendas exige a confirmação de uma prévia.

## Pré-requisitos

- Node.js 22+
- Docker e Docker Compose
- npm 10+

## Instalação local

1. Copie `.env.example` para `.env` e troque, principalmente, `ADMIN_PASSWORD` e `JWT_SECRET` (mínimo 32 caracteres). `QUEDA_PERCENTUAL` e `QUEDA_VOLUME_MINIMO` controlam a regra de cliente em queda. Nunca versione `.env`.
2. Inicie o banco: `docker compose up -d postgres`.
3. Instale dependências: `npm install`.
4. Gere o cliente e aplique a migration: `npm run db:generate` e `npm run db:migrate`.
5. Crie o administrador: `npm run db:seed`.
6. Inicie os dois serviços: `npm run dev`.
7. Abra `http://localhost:5173` e entre com `ADMIN_EMAIL` e `ADMIN_PASSWORD`.

## Fluxo do MVP

Em **Conexão com o Sírius**, informe URL, login, senha, filial e formato do header. O aviso de HTTP sem TLS é intencional. A senha não é salva; o token fica somente na memória do backend e uma reinicialização exige reconectar.

Em **Diagnóstico da API**, execute individualmente as consultas somente leitura. A amostra é limitada a três registros e mascara campos de CPF, CNPJ, telefone, e-mail e endereço. A autenticação é testada na própria tela de conexão.

Em **Sincronização**, selecione período, filial e opcionalmente vendedor. O padrão é um ano. Períodos são divididos por mês; falhas de um mês não interrompem os seguintes. Vendedores, clientes, vendas, itens e produtos são gravados com `upsert` e chaves únicas. O dashboard sempre lê o PostgreSQL local.

## Qualidade

- `npm test`: mediana, recompra, queda entre janelas de 90 dias, prioridade, associação dos itens por venda, janelas mensais e garantias de idempotência.
- `npm run typecheck`: TypeScript dos dois projetos.
- `npm run build`: builds de produção.

Datas são apresentadas em `pt-BR` e valores em BRL. Respostas externas têm timeout, JSON inválido é rejeitado, erros são centralizados e logs removem authorization, cookies e senhas.

## Produção / EasyPanel

Use um serviço App com o `Dockerfile` da raiz e um PostgreSQL. O App serve frontend e API juntos na porta `3333` e aplica as migrations ao iniciar. Veja o [passo a passo de deploy no EasyPanel](docs/EASYPANEL.md), incluindo variáveis de ambiente, domínio HTTPS e criação do administrador. Mantenha uma réplica enquanto as sessões do Sírius forem armazenadas em memória.

Consulte [arquitetura e contratos](docs/ARQUITETURA.md) para os modelos Swagger confirmados, fórmula de prioridade e limitações conhecidas.

## Agenda dos vendedores

Planeje contatos com limites diários, consulta da disponibilidade no Sírius e confirmação antes de criar. Veja [regras, uso e limites do agendamento](docs/AGENDAMENTO.md).
