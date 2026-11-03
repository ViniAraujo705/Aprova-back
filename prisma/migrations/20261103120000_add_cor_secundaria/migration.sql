-- Segunda cor da marca (white label), ao lado de cor_destaque (primaria).
-- Nullable nos dois niveis: null = herda (cliente -> agencia -> padrao do sistema).
ALTER TABLE "users" ADD COLUMN "cor_secundaria" TEXT;
ALTER TABLE "clients" ADD COLUMN "cor_secundaria" TEXT;
