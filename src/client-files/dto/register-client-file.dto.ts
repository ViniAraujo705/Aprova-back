import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ClientFileCategoria } from '@prisma/client';
import { ALLOWED_CLIENT_FILE_TYPES } from './client-file-upload-url.dto';

export class RegisterClientFileDto {
  @IsString()
  @IsNotEmpty()
  nomeArquivo: string;

  // URL/key retornada pelo passo de upload-url (publicUrl)
  @IsString()
  @IsNotEmpty()
  urlStorage: string;

  @IsIn(ALLOWED_CLIENT_FILE_TYPES, {
    message: `mimeType deve ser um dos seguintes: ${ALLOWED_CLIENT_FILE_TYPES.join(', ')}`,
  })
  mimeType: string;

  @IsOptional()
  @IsEnum(ClientFileCategoria, { message: 'categoria invalida' })
  categoria?: ClientFileCategoria;

  @IsOptional()
  @IsString()
  descricao?: string;
}
