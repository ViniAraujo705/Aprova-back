-- Plano de assinatura da conta (agencia). Sem gateway de pagamento
-- integrado ainda: troca de plano e manual, via endpoint admin.
CREATE TYPE "Plan" AS ENUM ('free', 'pro', 'agencia');

ALTER TABLE "accounts" ADD COLUMN "plan" "Plan" NOT NULL DEFAULT 'free';
