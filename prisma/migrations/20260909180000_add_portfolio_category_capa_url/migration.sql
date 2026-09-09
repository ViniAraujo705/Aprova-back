-- Capa propria da aba/categoria no hub publico do portfolio. Nullable: sem
-- ela, a vitrine cai no fallback historico (capa do primeiro album da
-- categoria), que fazia uma aba com varios albuns aparecer com a cara do
-- primeiro deles.
ALTER TABLE "portfolio_categories" ADD COLUMN "capa_url" TEXT;
