import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateVideoDto {
  @IsUUID('4', { message: 'project_id invalido' })
  projectId: string;

  // URL/key retornada pelo passo de upload-url (publicUrl)
  @IsString()
  @IsNotEmpty()
  urlStorage: string;

  @IsString()
  @IsNotEmpty()
  nomeArquivo: string;

  // Opcional: se nao informado, o backend calcula a proxima versao do projeto
  @IsOptional()
  @IsInt()
  @Min(1)
  versao?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true, message: 'labelIds deve conter UUIDs validos' })
  labelIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', {
    each: true,
    message: 'collaboratorIds deve conter UUIDs validos',
  })
  collaboratorIds?: string[];
}
