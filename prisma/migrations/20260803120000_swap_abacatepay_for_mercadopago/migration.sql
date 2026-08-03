-- Troca de gateway: AbacatePay descontinuou cartao/PIX Automatico pra
-- contas novas (sem previsao de retorno). Nenhuma conta chegou a ter esses
-- campos preenchidos (todos os testes de checkout falharam antes de
-- gravar qualquer coisa), entao e seguro remove-los.
DROP INDEX "accounts_abacatepay_subscription_id_key";
ALTER TABLE "accounts" DROP COLUMN "abacatepay_customer_id";
ALTER TABLE "accounts" DROP COLUMN "abacatepay_subscription_id";

ALTER TABLE "accounts" ADD COLUMN "mercadopago_subscription_id" TEXT;
CREATE UNIQUE INDEX "accounts_mercadopago_subscription_id_key" ON "accounts"("mercadopago_subscription_id");
