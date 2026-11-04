-- Capa (banner), bio e links de contato do hub publico de portfolios
ALTER TABLE "portfolio_profiles" ADD COLUMN "capa_url" TEXT;
ALTER TABLE "portfolio_profiles" ADD COLUMN "bio" TEXT;
ALTER TABLE "portfolio_profiles" ADD COLUMN "links" JSONB;

-- Destaque de item no album publico
ALTER TABLE "portfolio_videos" ADD COLUMN "destaque" BOOLEAN NOT NULL DEFAULT false;
