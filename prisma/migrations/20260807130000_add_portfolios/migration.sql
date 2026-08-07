-- Vitrine da agencia (Portfolio) + itens denormalizados (PortfolioVideo) -
-- ver comentarios no schema.prisma. Escrito a mao (nao via `prisma migrate
-- dev`): ambiente local nao tem shadow-db funcional por causa da duplicata
-- de ADD COLUMN avatar_url em migrations antigas.

CREATE TABLE "portfolios" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "link_publico" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolios_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "portfolios_link_publico_key" ON "portfolios"("link_publico");
CREATE INDEX "portfolios_account_id_idx" ON "portfolios"("account_id");

ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "portfolio_videos" (
    "id" TEXT NOT NULL,
    "portfolio_id" TEXT NOT NULL,
    "source_video_id" TEXT,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "url_storage" TEXT NOT NULL,
    "url_otimizada" TEXT,
    "poster_url" TEXT,
    "status_processamento" "ProcessamentoStatus" NOT NULL DEFAULT 'processando',
    "duracao_segundos" INTEGER,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_videos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "portfolio_videos_portfolio_id_idx" ON "portfolio_videos"("portfolio_id");
CREATE INDEX "portfolio_videos_source_video_id_idx" ON "portfolio_videos"("source_video_id");

ALTER TABLE "portfolio_videos" ADD CONSTRAINT "portfolio_videos_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "portfolio_videos" ADD CONSTRAINT "portfolio_videos_source_video_id_fkey" FOREIGN KEY ("source_video_id") REFERENCES "videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
