import { IsOptional, IsUrl, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateClientBrandingDto {
  // null limpa o logo (volta a herdar o branding da agencia); ausente
  // deixa como esta (ver ClientsService.updateBranding).
  @ApiPropertyOptional({
    description:
      'URL publica do logo proprio do cliente (apos upload no R2). null limpa (volta a herdar da agencia).',
  })
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'logoUrl deve ser uma URL válida' })
  logoUrl?: string | null;

  // null limpa a cor (volta a herdar o branding da agencia); ausente
  // deixa como esta.
  @ApiPropertyOptional({
    description:
      'Cor de destaque propria do cliente em hex, ex.: #d6336c. null limpa (volta a herdar da agencia).',
    example: '#d6336c',
  })
  @IsOptional()
  @Matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
    message: 'corDestaque deve ser um hex válido, ex.: #1E90FF',
  })
  corDestaque?: string | null;
}
