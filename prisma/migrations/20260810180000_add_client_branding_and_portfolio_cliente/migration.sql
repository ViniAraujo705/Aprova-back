-- Marca propria por cliente (white-label revendido pela agencia): mesmos
-- campos de User.logoUrl/corDestaque, agora tambem em Client. Quando
-- setados, sobrepoem o branding da agencia nos links publicos do cliente.
ALTER TABLE "clients" ADD COLUMN "logo_url" TEXT;
ALTER TABLE "clients" ADD COLUMN "cor_destaque" TEXT;

-- Etiqueta opcional: marca um album de portfolio como personalizado pra um
-- cliente especifico (so sinalizacao de marca, nao afeta acesso/dono).
ALTER TABLE "portfolios" ADD COLUMN "cliente_id" TEXT;

CREATE INDEX "portfolios_cliente_id_idx" ON "portfolios"("cliente_id");

ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
