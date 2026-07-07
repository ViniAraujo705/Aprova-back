import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateBrandingDto {
  @ApiPropertyOptional({
    description: 'Nome da agência (Account.nomeAgencia).',
    example: 'Agência Maria',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nome?: string;

  @ApiPropertyOptional({
    description: 'URL pública do logo da agência (após upload no R2).',
  })
  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false }, { message: 'logoUrl deve ser uma URL válida' })
  logoUrl?: string;

  @ApiPropertyOptional({
    description: 'Cor de destaque em hex, ex.: #1E90FF.',
    example: '#1E90FF',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
    message: 'corDestaque deve ser um hex válido, ex.: #1E90FF',
  })
  corDestaque?: string;
}
