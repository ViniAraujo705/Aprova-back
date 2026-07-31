-- Login social (Google/Apple): senha vira opcional (contas 100% sociais
-- nao tem senha local) e adicionamos os identificadores do provedor +
-- avatar do perfil.
ALTER TABLE "users" ALTER COLUMN "senha" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "google_id" TEXT;
ALTER TABLE "users" ADD COLUMN "apple_id" TEXT;
ALTER TABLE "users" ADD COLUMN "avatar_url" TEXT;

CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");
CREATE UNIQUE INDEX "users_apple_id_key" ON "users"("apple_id");
