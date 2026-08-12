-- Responsavel interno opcional por cliente. A associacao deve ser validada
-- pela aplicacao contra Membership para preservar o isolamento por conta.
ALTER TABLE "clients" ADD COLUMN "responsavel_id" TEXT;

CREATE INDEX "clients_responsavel_id_idx" ON "clients"("responsavel_id");

ALTER TABLE "clients" ADD CONSTRAINT "clients_responsavel_id_fkey"
  FOREIGN KEY ("responsavel_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
