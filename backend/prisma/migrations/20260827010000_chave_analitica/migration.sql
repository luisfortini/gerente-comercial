ALTER TABLE "oportunidades_comerciais" ADD COLUMN "chave_analitica" TEXT;

UPDATE "oportunidades_comerciais"
SET "chave_analitica" = 'legado:' || "id"
WHERE "chave_analitica" IS NULL;

ALTER TABLE "oportunidades_comerciais" ALTER COLUMN "chave_analitica" SET NOT NULL;
CREATE UNIQUE INDEX "oportunidades_comerciais_chave_analitica_key"
ON "oportunidades_comerciais"("chave_analitica");
