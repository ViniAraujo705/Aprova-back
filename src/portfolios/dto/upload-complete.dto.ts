import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PortfolioUploadCompleteDto {
  // URL/key retornada pelo passo de upload-url (publicUrl)
  @IsString()
  @IsNotEmpty()
  urlStorage: string;

  @IsString()
  @IsNotEmpty()
  nomeArquivo: string;

  // Se omitido, usa o nomeArquivo como titulo
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  titulo?: string;

  @IsOptional()
  @IsString()
  descricao?: string;
}
