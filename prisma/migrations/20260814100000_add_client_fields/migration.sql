-- Definicoes de campos extras por agencia e valores livres por cliente.
CREATE TABLE "client_fields" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_fields_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "clients" ADD COLUMN "campos_personalizados" JSONB;

CREATE INDEX "client_fields_account_id_ordem_idx" ON "client_fields"("account_id", "ordem");

ALTER TABLE "client_fields" ADD CONSTRAINT "client_fields_account_id_fkey"
FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
