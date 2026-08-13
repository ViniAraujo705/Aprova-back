import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PortfolioMediaType } from '@prisma/client';

export class UpdatePortfolioVideoDto {
  @IsOptional()
  @IsIn(Object.values(PortfolioMediaType), { message: 'tipoMidia invalido' })
  tipoMidia?: PortfolioMediaType;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  titulo?: string;

  // null limpa a descricao; ausente deixa como esta
  @IsOptional()
  @IsString()
  descricao?: string | null;
}
