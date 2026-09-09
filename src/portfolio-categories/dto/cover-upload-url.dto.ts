import { IsIn, IsNotEmpty, IsString } from 'class-validator';

// So imagem - capa da aba do hub, mesmos tipos aceitos pra capa de album
// (ver PortfolioCoverUploadUrlDto), sem svg.
const ALLOWED_COVER_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export class PortfolioCategoryCoverUploadUrlDto {
  @IsString()
  @IsNotEmpty()
  nomeArquivo: string;

  @IsIn(ALLOWED_COVER_IMAGE_TYPES, {
    message: `contentType deve ser um dos seguintes: ${ALLOWED_COVER_IMAGE_TYPES.join(', ')}`,
  })
  contentType: string;
}
