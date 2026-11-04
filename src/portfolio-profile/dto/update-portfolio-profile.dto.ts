import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const PORTFOLIO_TEMPLATE_IDS = [
  'minimalista',
  'grade',
  'revista',
  'editorial-escuro',
  'retrato',
] as const;

type PortfolioTemplateId = (typeof PORTFOLIO_TEMPLATE_IDS)[number];

export class PortfolioProfileLinkDto {
  @IsString()
  @IsNotEmpty({ message: 'Informe o nome do link' })
  @MaxLength(100, {
    message: 'O nome do link pode ter no maximo 100 caracteres',
  })
  rotulo: string;

  // Aceita "instagram.com/agencia" (o service completa com https://), mas
  // recusa esquemas que nao sejam http(s)/mailto/tel (ex.: javascript:).
  @IsString()
  @IsNotEmpty({ message: 'Informe o endereco do link' })
  @MaxLength(500, { message: 'Link muito longo' })
  @Matches(
    /^(?:(?:https?|mailto|tel):|(?![a-z][a-z0-9+.-]*:\/\/)(?!javascript:|data:|vbscript:))/i,
    {
      message:
        'Link invalido - use um endereco como https://instagram.com/sua-agencia',
    },
  )
  url: string;
}

export class UpdatePortfolioProfileDto {
  // null limpa a foto; ausente deixa como esta
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'fotoUrl deve ser uma URL valida' })
  fotoUrl?: string | null;

  // null deixa a escolha de layout livre; ausente preserva o tema atual.
  @IsOptional()
  @IsIn(PORTFOLIO_TEMPLATE_IDS, { message: 'templateId invalido' })
  templateId?: PortfolioTemplateId | null;

  // Banner do hub. null remove; ausente deixa como esta.
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'capaUrl deve ser uma URL valida' })
  capaUrl?: string | null;

  // null limpa; ausente deixa como esta.
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'A bio pode ter no maximo 500 caracteres' })
  bio?: string | null;

  // Lista completa (substitui a anterior); ausente deixa como esta.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PortfolioProfileLinkDto)
  links?: PortfolioProfileLinkDto[];
}
