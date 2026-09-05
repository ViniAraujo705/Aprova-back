-- A Asaas nao propaga o externalReference do Checkout para a assinatura nem
-- para as cobrancas geradas (verificado na API de producao: ambos vem null).
-- A reconciliacao passa a ser pelo Customer, que o webhook de pagamento
-- sempre traz. Ver src/billing/billing.service.ts.

-- Plano contratado, distinto de "plan" (plano em vigor). Fica preenchido do
-- checkout ate o cancelamento e permite restaurar o acesso quando uma
-- cobranca vencida e finalmente paga.
ALTER TABLE "accounts" ADD COLUMN "asaas_plan" "Plan";

-- MONTHLY ou YEARLY. Guardado para a UI mostrar o ciclo vigente.
ALTER TABLE "accounts" ADD COLUMN "asaas_cycle" TEXT;

-- Sessao de checkout mais recente, so para rastrear o pagamento no painel
-- da Asaas quando o cliente abre um chamado.
ALTER TABLE "accounts" ADD COLUMN "asaas_checkout_id" TEXT;

-- A conta e encontrada por esta coluna a cada webhook de pagamento.
CREATE INDEX "accounts_asaas_customer_id_idx" ON "accounts"("asaas_customer_id");
