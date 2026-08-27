import { IsIn, IsNotEmpty, IsString } from 'class-validator';

const ALLOWED_CHECKDAY_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export class CheckDayImageUploadUrlDto {
  @IsString()
  @IsNotEmpty()
  nomeArquivo: string;

  @IsIn(ALLOWED_CHECKDAY_IMAGE_TYPES, {
    message: `contentType deve ser um dos seguintes: ${ALLOWED_CHECKDAY_IMAGE_TYPES.join(', ')}`,
  })
  contentType: string;
}
