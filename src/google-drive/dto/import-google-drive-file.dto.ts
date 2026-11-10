import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class ImportGoogleDriveFileDto {
  @IsUUID('4', { message: 'projectId invalido' })
  projectId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  googleFileId: string;

  /** Nome de exibicao do video; sem ele, usa o nome do arquivo no Drive. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  nomeArquivo?: string;
}
