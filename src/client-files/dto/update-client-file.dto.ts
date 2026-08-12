import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ClientFileCategoria } from '@prisma/client';

export class UpdateClientFileDto {
  @IsOptional()
  @IsString()
  nomeArquivo?: string;

  @IsOptional()
  @IsEnum(ClientFileCategoria, { message: 'categoria invalida' })
  categoria?: ClientFileCategoria;

  @IsOptional()
  @IsString()
  descricao?: string;
}
