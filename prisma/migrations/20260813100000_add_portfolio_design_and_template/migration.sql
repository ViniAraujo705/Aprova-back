-- Design e uma imagem de portfolio com rotulo proprio, preservado em todas
-- as respostas da API. O PostgreSQL exige ALTER TYPE para expandir o enum.
ALTER TYPE "PortfolioMediaType" ADD VALUE 'design';

-- Tema puramente cosmetico do hub publico. Texto mantem o ID publico
-- "editorial-escuro" sem transforma-lo para um identificador de enum.
ALTER TABLE "portfolio_profiles" ADD COLUMN "template_id" TEXT;
