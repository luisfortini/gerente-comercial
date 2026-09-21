CREATE TABLE "acoes_agenda" (
  "id" TEXT NOT NULL,
  "usuario_id" TEXT NOT NULL,
  "destino" TEXT NOT NULL,
  "vendedor_id" TEXT NOT NULL,
  "operacao" TEXT NOT NULL,
  "estado" TEXT NOT NULL,
  "dados" JSONB NOT NULL,
  "resultado" JSONB,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "acoes_agenda_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "acoes_agenda_destino_vendedor_id_estado_idx" ON "acoes_agenda"("destino", "vendedor_id", "estado");
