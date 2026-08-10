import { IsIn, IsNotEmpty, IsString } from 'class-validator';

const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
] as const;

export class ClientBrandingLogoUploadUrlDto {
  @IsString()
  @IsNotEmpty()
  nomeArquivo: string;

  @IsIn(ALLOWED_IMAGE_TYPES, {
    message: `contentType deve ser um dos seguintes: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
  })
  contentType: string;
}
