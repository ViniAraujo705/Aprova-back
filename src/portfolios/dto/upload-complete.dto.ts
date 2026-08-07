import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PortfolioMediaType } from '@prisma/client';

export class PortfolioUploadCompleteDto {
  // URL/key retornada pelo passo de upload-url (publicUrl)
  @IsString()
  @IsNotEmpty()
  urlStorage: string;

  @IsString()
  @IsNotEmpty()
  nomeArquivo: string;

  @IsIn(Object.values(PortfolioMediaType))
  tipoMidia: PortfolioMediaType;

  // Se omitido, usa o nomeArquivo como titulo
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  titulo?: string;

  @IsOptional()
  @IsString()
  descricao?: string;
}
