-- Portfolio agora aceita fotos alem de video (PortfolioVideo.tipoMidia).
-- Foto nao passa pelo pipeline de thumbnail/otimizacao: url_storage fica
-- null e a propria foto vira poster_url (ver PortfoliosService.uploadComplete).
-- Escrito a mao (mesmo motivo de sempre - shadow-db local quebrado).

CREATE TYPE "PortfolioMediaType" AS ENUM ('video', 'foto');

ALTER TABLE "portfolio_videos" ADD COLUMN "tipo_midia" "PortfolioMediaType" NOT NULL DEFAULT 'video';
ALTER TABLE "portfolio_videos" ALTER COLUMN "url_storage" DROP NOT NULL;
