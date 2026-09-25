CREATE TABLE "configuracao_produto" (
    "id" TEXT NOT NULL DEFAULT 'principal',
    "prazo_desenvolvimento" TEXT,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracao_produto_pkey" PRIMARY KEY ("id")
);
