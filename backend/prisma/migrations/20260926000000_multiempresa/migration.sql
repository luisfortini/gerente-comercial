CREATE TYPE "PapelEmpresa" AS ENUM ('ADMIN');

CREATE TABLE "empresas" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "documento" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "usuarios_empresas" (
    "usuario_id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "papel" "PapelEmpresa" NOT NULL DEFAULT 'ADMIN',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "usuarios_empresas_pkey" PRIMARY KEY ("usuario_id", "empresa_id")
);

INSERT INTO "empresas" ("id", "nome", "atualizado_em")
VALUES ('empresa_padrao', 'Empresa principal', CURRENT_TIMESTAMP);

INSERT INTO "usuarios_empresas" ("usuario_id", "empresa_id", "papel")
SELECT "id", 'empresa_padrao', 'ADMIN'::"PapelEmpresa" FROM "usuarios";

ALTER TABLE "configuracoes_sirius" ADD COLUMN "empresa_id" TEXT NOT NULL DEFAULT 'empresa_padrao';
ALTER TABLE "vendedores" ADD COLUMN "empresa_id" TEXT NOT NULL DEFAULT 'empresa_padrao';
ALTER TABLE "clientes" ADD COLUMN "empresa_id" TEXT NOT NULL DEFAULT 'empresa_padrao';
ALTER TABLE "produtos" ADD COLUMN "empresa_id" TEXT NOT NULL DEFAULT 'empresa_padrao';
ALTER TABLE "vendas" ADD COLUMN "empresa_id" TEXT NOT NULL DEFAULT 'empresa_padrao';
ALTER TABLE "oportunidades_comerciais" ADD COLUMN "empresa_id" TEXT NOT NULL DEFAULT 'empresa_padrao';
ALTER TABLE "execucoes_sincronizacao" ADD COLUMN "empresa_id" TEXT NOT NULL DEFAULT 'empresa_padrao';
ALTER TABLE "planos_agenda" ADD COLUMN "empresa_id" TEXT NOT NULL DEFAULT 'empresa_padrao';
ALTER TABLE "acoes_agenda" ADD COLUMN "empresa_id" TEXT NOT NULL DEFAULT 'empresa_padrao';
ALTER TABLE "atendimentos_agenda" ADD COLUMN "empresa_id" TEXT NOT NULL DEFAULT 'empresa_padrao';

ALTER TABLE "configuracoes_sirius" ALTER COLUMN "empresa_id" DROP DEFAULT;
ALTER TABLE "vendedores" ALTER COLUMN "empresa_id" DROP DEFAULT;
ALTER TABLE "clientes" ALTER COLUMN "empresa_id" DROP DEFAULT;
ALTER TABLE "produtos" ALTER COLUMN "empresa_id" DROP DEFAULT;
ALTER TABLE "vendas" ALTER COLUMN "empresa_id" DROP DEFAULT;
ALTER TABLE "oportunidades_comerciais" ALTER COLUMN "empresa_id" DROP DEFAULT;
ALTER TABLE "execucoes_sincronizacao" ALTER COLUMN "empresa_id" DROP DEFAULT;
ALTER TABLE "planos_agenda" ALTER COLUMN "empresa_id" DROP DEFAULT;
ALTER TABLE "acoes_agenda" ALTER COLUMN "empresa_id" DROP DEFAULT;
ALTER TABLE "atendimentos_agenda" ALTER COLUMN "empresa_id" DROP DEFAULT;

ALTER TABLE "configuracoes_sirius" DROP CONSTRAINT "configuracoes_sirius_usuario_id_fkey";
DROP INDEX "configuracoes_sirius_usuario_id_key";
ALTER TABLE "configuracoes_sirius" DROP COLUMN "usuario_id";

DROP INDEX "vendedores_codigo_externo_filial_codigo_key";
DROP INDEX "vendedores_nome_idx";
DROP INDEX "clientes_codigo_externo_filial_codigo_key";
DROP INDEX "clientes_vendedor_id_idx";
DROP INDEX "produtos_codigo_externo_key";
DROP INDEX "produtos_descricao_idx";
DROP INDEX "vendas_chave_externa_key";
DROP INDEX "vendas_data_emissao_idx";
DROP INDEX "oportunidades_comerciais_chave_analitica_key";
DROP INDEX "oportunidades_comerciais_prioridade_status_idx";
DROP INDEX "oportunidades_comerciais_vendedor_id_idx";
DROP INDEX "execucoes_sincronizacao_status_data_inicial_idx";

CREATE INDEX "empresas_nome_idx" ON "empresas"("nome");
CREATE INDEX "usuarios_empresas_empresa_id_idx" ON "usuarios_empresas"("empresa_id");
CREATE UNIQUE INDEX "configuracoes_sirius_empresa_id_key" ON "configuracoes_sirius"("empresa_id");
CREATE UNIQUE INDEX "vendedores_empresa_id_codigo_externo_filial_codigo_key" ON "vendedores"("empresa_id", "codigo_externo", "filial_codigo");
CREATE INDEX "vendedores_empresa_id_nome_idx" ON "vendedores"("empresa_id", "nome");
CREATE UNIQUE INDEX "clientes_empresa_id_codigo_externo_filial_codigo_key" ON "clientes"("empresa_id", "codigo_externo", "filial_codigo");
CREATE INDEX "clientes_empresa_id_vendedor_id_idx" ON "clientes"("empresa_id", "vendedor_id");
CREATE UNIQUE INDEX "produtos_empresa_id_codigo_externo_key" ON "produtos"("empresa_id", "codigo_externo");
CREATE INDEX "produtos_empresa_id_descricao_idx" ON "produtos"("empresa_id", "descricao");
CREATE UNIQUE INDEX "vendas_empresa_id_chave_externa_key" ON "vendas"("empresa_id", "chave_externa");
CREATE INDEX "vendas_empresa_id_data_emissao_idx" ON "vendas"("empresa_id", "data_emissao");
CREATE UNIQUE INDEX "oportunidades_comerciais_empresa_id_chave_analitica_key" ON "oportunidades_comerciais"("empresa_id", "chave_analitica");
CREATE INDEX "oportunidades_comerciais_empresa_id_prioridade_status_idx" ON "oportunidades_comerciais"("empresa_id", "prioridade", "status");
CREATE INDEX "oportunidades_comerciais_empresa_id_vendedor_id_idx" ON "oportunidades_comerciais"("empresa_id", "vendedor_id");
CREATE INDEX "execucoes_sincronizacao_empresa_id_status_data_inicial_idx" ON "execucoes_sincronizacao"("empresa_id", "status", "data_inicial");
CREATE INDEX "planos_agenda_empresa_id_criado_em_idx" ON "planos_agenda"("empresa_id", "criado_em");
CREATE INDEX "acoes_agenda_empresa_id_criado_em_idx" ON "acoes_agenda"("empresa_id", "criado_em");
CREATE INDEX "atendimentos_agenda_empresa_id_criado_em_idx" ON "atendimentos_agenda"("empresa_id", "criado_em");

ALTER TABLE "usuarios_empresas" ADD CONSTRAINT "usuarios_empresas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "usuarios_empresas" ADD CONSTRAINT "usuarios_empresas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "configuracoes_sirius" ADD CONSTRAINT "configuracoes_sirius_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendedores" ADD CONSTRAINT "vendedores_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "oportunidades_comerciais" ADD CONSTRAINT "oportunidades_comerciais_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "execucoes_sincronizacao" ADD CONSTRAINT "execucoes_sincronizacao_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "planos_agenda" ADD CONSTRAINT "planos_agenda_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "acoes_agenda" ADD CONSTRAINT "acoes_agenda_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "atendimentos_agenda" ADD CONSTRAINT "atendimentos_agenda_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
