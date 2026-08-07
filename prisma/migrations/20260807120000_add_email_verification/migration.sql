-- Migration: confirmacao de email no cadastro (email de boas-vindas + link de confirmacao).

ALTER TABLE "users" ADD COLUMN "email_verificado_em" TIMESTAMP(3);

CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "expires_em" TIMESTAMP(3) NOT NULL,
    "used_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_verification_tokens_token_key" ON "email_verification_tokens"("token");
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens"("user_id");

ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: usuarios existentes de login social ja tiveram o email verificado pelo provider.
UPDATE "users" SET "email_verificado_em" = "criado_em" WHERE "google_id" IS NOT NULL OR "apple_id" IS NOT NULL;
