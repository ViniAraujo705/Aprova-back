-- Troca de gateway: Mercado Pago -> Asaas. Nenhuma conta real chegou a
-- pagar via Mercado Pago (nenhum assinante em producao), entao e seguro
-- remover o campo sem migracao de dados.
DROP INDEX "accounts_mercadopago_subscription_id_key";
ALTER TABLE "accounts" DROP COLUMN "mercadopago_subscription_id";

ALTER TABLE "accounts" ADD COLUMN "cpf_cnpj" TEXT;
ALTER TABLE "accounts" ADD COLUMN "asaas_customer_id" TEXT;
ALTER TABLE "accounts" ADD COLUMN "asaas_subscription_id" TEXT;
CREATE UNIQUE INDEX "accounts_asaas_subscription_id_key" ON "accounts"("asaas_subscription_id");
