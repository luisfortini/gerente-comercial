CREATE TABLE "planos_agenda" (
  "id" TEXT NOT NULL,
  "usuario_id" TEXT NOT NULL,
  "destino" TEXT NOT NULL,
  "vendedor_id" TEXT NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'PREVIA',
  "dados" JSONB NOT NULL,
  "resultado" JSONB,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "planos_agenda_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "planos_agenda_destino_vendedor_id_estado_idx" ON "planos_agenda"("destino", "vendedor_id", "estado");
