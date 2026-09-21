-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "FormatoAuthorization" AS ENUM ('PURO', 'BEARER');

-- CreateEnum
CREATE TYPE "Prioridade" AS ENUM ('BAIXA', 'MEDIA', 'ALTA');

-- CreateEnum
CREATE TYPE "StatusOportunidade" AS ENUM ('NOVA', 'EM_ANALISE', 'ENCAMINHADA', 'CONTATO_REALIZADO', 'VENDA_REALIZADA', 'SEM_INTERESSE', 'DESCARTADA');

-- CreateEnum
CREATE TYPE "TipoOportunidade" AS ENUM ('RECOMPRA_CLIENTE', 'RECOMPRA_PRODUTO', 'CLIENTE_EM_QUEDA');

-- CreateEnum
CREATE TYPE "StatusSincronizacao" AS ENUM ('EM_ANDAMENTO', 'CONCLUIDA', 'PARCIAL', 'FALHA');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracoes_sirius" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "url_base" TEXT NOT NULL,
    "filial_codigo" INTEGER NOT NULL,
    "login_sirius" TEXT NOT NULL,
    "sistema_codigo" INTEGER,
    "sistema_versao" TEXT,
    "subsistema_codigo" INTEGER,
    "subsistema_versao" TEXT,
    "formato_authorization" "FormatoAuthorization" NOT NULL DEFAULT 'PURO',
    "conectado_em" TIMESTAMP(3),
    "ultimo_status" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracoes_sirius_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendedores" (
    "id" TEXT NOT NULL,
    "codigo_externo" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "telefone" TEXT,
    "filial_codigo" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "dados_originais_json" JSONB,
    "sincronizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "codigo_externo" INTEGER NOT NULL,
    "razao_social" TEXT,
    "nome_fantasia" TEXT,
    "vendedor_id" TEXT,
    "filial_codigo" INTEGER NOT NULL,
    "cidade" TEXT,
    "regiao" TEXT,
    "atividade" TEXT,
    "dados_originais_json" JSONB,
    "sincronizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos" (
    "id" TEXT NOT NULL,
    "codigo_externo" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "codigo_barras" TEXT,
    "fabricante" TEXT,
    "grupo" TEXT,
    "categoria" TEXT,
    "dados_originais_json" JSONB,
    "sincronizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendas" (
    "id" TEXT NOT NULL,
    "chave_externa" TEXT NOT NULL,
    "numero" TEXT,
    "serie" TEXT,
    "natureza_operacao" TEXT,
    "data_emissao" TIMESTAMP(3) NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "vendedor_id" TEXT,
    "filial_codigo" INTEGER NOT NULL,
    "valor_total" DECIMAL(15,2) NOT NULL,
    "dados_originais_json" JSONB,
    "sincronizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_venda" (
    "id" TEXT NOT NULL,
    "venda_id" TEXT NOT NULL,
    "produto_id" TEXT NOT NULL,
    "quantidade" DECIMAL(15,4) NOT NULL,
    "valor_unitario" DECIMAL(15,4) NOT NULL,
    "valor_total" DECIMAL(15,2) NOT NULL,
    "desconto" DECIMAL(15,2),
    "dados_originais_json" JSONB,

    CONSTRAINT "itens_venda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oportunidades_comerciais" (
    "id" TEXT NOT NULL,
    "tipo" "TipoOportunidade" NOT NULL,
    "prioridade" "Prioridade" NOT NULL,
    "pontuacao" INTEGER NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "vendedor_id" TEXT,
    "produto_id" TEXT,
    "titulo" TEXT NOT NULL,
    "explicacao" TEXT NOT NULL,
    "ultima_compra_em" TIMESTAMP(3),
    "dias_sem_comprar" INTEGER,
    "intervalo_medio_dias" INTEGER,
    "atraso_dias" INTEGER,
    "quantidade_media" DECIMAL(15,4),
    "quantidade_sugerida" DECIMAL(15,4),
    "valor_potencial" DECIMAL(15,2),
    "status" "StatusOportunidade" NOT NULL DEFAULT 'NOVA',
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizada_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oportunidades_comerciais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execucoes_sincronizacao" (
    "id" TEXT NOT NULL,
    "data_inicial" TIMESTAMP(3) NOT NULL,
    "data_final" TIMESTAMP(3) NOT NULL,
    "filial_codigo" INTEGER NOT NULL,
    "vendedor_codigo" INTEGER,
    "status" "StatusSincronizacao" NOT NULL,
    "registros_recebidos" INTEGER NOT NULL DEFAULT 0,
    "registros_salvos" INTEGER NOT NULL DEFAULT 0,
    "mensagem_erro" TEXT,
    "iniciada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizada_em" TIMESTAMP(3),

    CONSTRAINT "execucoes_sincronizacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "configuracoes_sirius_usuario_id_key" ON "configuracoes_sirius"("usuario_id");

-- CreateIndex
CREATE INDEX "vendedores_nome_idx" ON "vendedores"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "vendedores_codigo_externo_filial_codigo_key" ON "vendedores"("codigo_externo", "filial_codigo");

-- CreateIndex
CREATE INDEX "clientes_vendedor_id_idx" ON "clientes"("vendedor_id");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_codigo_externo_filial_codigo_key" ON "clientes"("codigo_externo", "filial_codigo");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_codigo_externo_key" ON "produtos"("codigo_externo");

-- CreateIndex
CREATE INDEX "produtos_descricao_idx" ON "produtos"("descricao");

-- CreateIndex
CREATE UNIQUE INDEX "vendas_chave_externa_key" ON "vendas"("chave_externa");

-- CreateIndex
CREATE INDEX "vendas_data_emissao_idx" ON "vendas"("data_emissao");

-- CreateIndex
CREATE INDEX "vendas_cliente_id_data_emissao_idx" ON "vendas"("cliente_id", "data_emissao");

-- CreateIndex
CREATE UNIQUE INDEX "itens_venda_venda_id_produto_id_key" ON "itens_venda"("venda_id", "produto_id");

-- CreateIndex
CREATE INDEX "oportunidades_comerciais_prioridade_status_idx" ON "oportunidades_comerciais"("prioridade", "status");

-- CreateIndex
CREATE INDEX "oportunidades_comerciais_vendedor_id_idx" ON "oportunidades_comerciais"("vendedor_id");

-- CreateIndex
CREATE INDEX "execucoes_sincronizacao_status_data_inicial_idx" ON "execucoes_sincronizacao"("status", "data_inicial");

-- AddForeignKey
ALTER TABLE "configuracoes_sirius" ADD CONSTRAINT "configuracoes_sirius_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_venda" ADD CONSTRAINT "itens_venda_venda_id_fkey" FOREIGN KEY ("venda_id") REFERENCES "vendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_venda" ADD CONSTRAINT "itens_venda_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades_comerciais" ADD CONSTRAINT "oportunidades_comerciais_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades_comerciais" ADD CONSTRAINT "oportunidades_comerciais_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades_comerciais" ADD CONSTRAINT "oportunidades_comerciais_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
