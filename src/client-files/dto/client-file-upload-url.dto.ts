import { IsIn, IsNotEmpty, IsString } from 'class-validator';

// Arquivos operacionais do cliente (briefing, contrato, referencia,
// roteiro, logo) - whitelist mais ampla que a de video/foto.
export const ALLOWED_CLIENT_FILE_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'application/zip',
] as const;

export class ClientFileUploadUrlDto {
  @IsString()
  @IsNotEmpty()
  nomeArquivo: string;

  @IsIn(ALLOWED_CLIENT_FILE_TYPES, {
    message: `contentType deve ser um dos seguintes: ${ALLOWED_CLIENT_FILE_TYPES.join(', ')}`,
  })
  contentType: string;
}
