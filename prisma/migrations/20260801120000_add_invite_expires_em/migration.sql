-- Expiracao de convite (3 dias). Convites existentes recebem expiracao
-- retroativa a partir de criado_em, para nao quebrar o NOT NULL abaixo.
ALTER TABLE "invites" ADD COLUMN "expires_em" TIMESTAMP(3);

UPDATE "invites" SET "expires_em" = "criado_em" + INTERVAL '3 days' WHERE "expires_em" IS NULL;

ALTER TABLE "invites" ALTER COLUMN "expires_em" SET NOT NULL;
