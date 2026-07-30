-- Foto de perfil do usuario (upload direto no R2, ver /users/me/photo-upload-url).
ALTER TABLE "users" ADD COLUMN "avatar_url" TEXT;
