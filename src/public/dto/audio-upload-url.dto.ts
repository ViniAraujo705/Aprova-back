import { IsIn, IsNotEmpty, IsString } from 'class-validator';

const ALLOWED_AUDIO_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
] as const;

export class AudioUploadUrlDto {
  @IsString()
  @IsNotEmpty()
  nomeArquivo: string;

  @IsIn(ALLOWED_AUDIO_TYPES, {
    message: `contentType deve ser um dos seguintes: ${ALLOWED_AUDIO_TYPES.join(', ')}`,
  })
  contentType: string;
}
