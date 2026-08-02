-- Assinatura paga (AbacatePay). Ambas nulas ate a primeira assinatura ser
-- criada/confirmada.
ALTER TABLE "accounts" ADD COLUMN "abacatepay_customer_id" TEXT;
ALTER TABLE "accounts" ADD COLUMN "abacatepay_subscription_id" TEXT;

CREATE UNIQUE INDEX "accounts_abacatepay_subscription_id_key" ON "accounts"("abacatepay_subscription_id");
