import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { LabelColor } from '@prisma/client';

// Anexos de card: os mesmos tipos dos arquivos de cliente + gif, video curto
// de referencia e audio.
export const ALLOWED_ANEXO_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'video/mp4',
  'video/quicktime',
  'audio/mpeg',
  'audio/mp4',
] as const;

/** Tipos que podem virar capa do card. */
export const COVER_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export class AnexoUploadUrlDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nomeArquivo: string;

  @IsIn(ALLOWED_ANEXO_TYPES, { message: 'Tipo de arquivo nao permitido' })
  contentType: string;
}

export class RegisterAnexoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nomeArquivo: string;

  /** publicUrl devolvida pelo passo de upload-url. */
  @IsString()
  @IsNotEmpty()
  urlStorage: string;

  @IsIn(ALLOWED_ANEXO_TYPES, { message: 'Tipo de arquivo nao permitido' })
  mimeType: string;
}

export class SetCapaDto {
  /** Id de um anexo de imagem do card; null tira a capa. */
  @IsOptional()
  @IsUUID('4')
  anexoId?: string | null;

  /** Capa so de cor. Vale quando anexoId nao vem; null tira a capa. */
  @IsOptional()
  @IsEnum(LabelColor, { message: 'cor invalida' })
  cor?: LabelColor | null;
}
