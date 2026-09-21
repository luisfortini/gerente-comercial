ALTER TABLE "vendas" ADD COLUMN "modo_relatorio" INTEGER;

CREATE INDEX "vendas_modo_relatorio_data_emissao_idx"
ON "vendas"("modo_relatorio", "data_emissao");
