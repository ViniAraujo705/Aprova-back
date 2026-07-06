import { IsIn, IsNotEmpty, IsString } from 'class-validator';

const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/mpeg',
] as const;

export class UploadUrlDto {
  @IsString()
  @IsNotEmpty()
  nomeArquivo: string;

  @IsIn(ALLOWED_VIDEO_TYPES, {
    message: `contentType deve ser um dos seguintes: ${ALLOWED_VIDEO_TYPES.join(', ')}`,
  })
  contentType: string;
}
