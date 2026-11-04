-- CheckDay: notas e checklists internos compartilhados pela conta.
-- `visibilidade` nasce como equipe; privada fica reservada para uma futura
-- filtragem por author_id sem precisar alterar a tabela.

CREATE TYPE "CheckDayNoteVisibilidade" AS ENUM ('equipe', 'privada');

CREATE TABLE "checkday_notes" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "image_url" TEXT,
    "visibilidade" "CheckDayNoteVisibilidade" NOT NULL DEFAULT 'equipe',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkday_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "checkday_notes_account_id_updated_at_idx"
    ON "checkday_notes"("account_id", "updated_at");
CREATE INDEX "checkday_notes_account_id_author_id_idx"
    ON "checkday_notes"("account_id", "author_id");

ALTER TABLE "checkday_notes"
    ADD CONSTRAINT "checkday_notes_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checkday_notes"
    ADD CONSTRAINT "checkday_notes_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
