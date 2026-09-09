import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdatePortfolioCategoryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nome?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  ordem?: number;

  // Capa propria da aba no hub publico, setada a partir da publicUrl de
  // POST /portfolio-categories/:id/cover-upload-url. null remove a capa
  // (a vitrine volta a cair no fallback da capa do primeiro album).
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'capaUrl deve ser uma URL valida' })
  capaUrl?: string | null;
}
