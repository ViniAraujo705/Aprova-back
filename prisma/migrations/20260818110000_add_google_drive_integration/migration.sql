-- Google Drive: conexao OAuth individual e atalhos de arquivos/pastas por
-- projeto. Nenhum conteudo do Drive e copiado para o banco.

CREATE TABLE "google_drive_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "google_email" TEXT,
    "refresh_token_enc" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_drive_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_google_drive_items" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "linked_by_user_id" TEXT,
    "google_file_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "is_folder" BOOLEAN NOT NULL DEFAULT false,
    "web_view_link" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_google_drive_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "google_drive_connections_user_id_key"
    ON "google_drive_connections"("user_id");
CREATE UNIQUE INDEX "project_google_drive_items_project_id_google_file_id_key"
    ON "project_google_drive_items"("project_id", "google_file_id");
CREATE INDEX "project_google_drive_items_linked_by_user_id_idx"
    ON "project_google_drive_items"("linked_by_user_id");

ALTER TABLE "google_drive_connections"
    ADD CONSTRAINT "google_drive_connections_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_google_drive_items"
    ADD CONSTRAINT "project_google_drive_items_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_google_drive_items"
    ADD CONSTRAINT "project_google_drive_items_linked_by_user_id_fkey"
    FOREIGN KEY ("linked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
