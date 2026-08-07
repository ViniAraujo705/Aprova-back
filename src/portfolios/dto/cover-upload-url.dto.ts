import { IsIn, IsNotEmpty, IsString } from 'class-validator';

// So imagem - capa de album, mesmos tipos aceitos pra foto em
// POST /portfolios/:id/upload-url (sem svg).
const ALLOWED_COVER_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export class PortfolioCoverUploadUrlDto {
  @IsString()
  @IsNotEmpty()
  nomeArquivo: string;

  @IsIn(ALLOWED_COVER_IMAGE_TYPES, {
    message: `contentType deve ser um dos seguintes: ${ALLOWED_COVER_IMAGE_TYPES.join(', ')}`,
  })
  contentType: string;
}
