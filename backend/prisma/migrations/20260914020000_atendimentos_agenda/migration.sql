CREATE TABLE "atendimentos_agenda" (
  "id" TEXT NOT NULL,
  "usuario_id" TEXT NOT NULL,
  "destino" TEXT NOT NULL,
  "vendedor_id" TEXT NOT NULL,
  "agenda_codigo" INTEGER NOT NULL,
  "agenda_versao" TEXT NOT NULL,
  "estado" TEXT NOT NULL,
  "dados" JSONB NOT NULL,
  "resultado" JSONB,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "atendimentos_agenda_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "atendimentos_agenda_destino_vendedor_id_agenda_codigo_estado_idx" ON "atendimentos_agenda"("destino", "vendedor_id", "agenda_codigo", "estado");
