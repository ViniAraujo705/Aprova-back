import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Paleta de fundos do quadro (as cores sao do front, na identidade do Check). */
export const FUNDOS_QUADRO = ['verde', 'musgo', 'grafite', 'areia', 'lima', 'ceu'] as const;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateQuadroDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nome: string;

  /** Nomes das colunas iniciais; sem isso: A fazer / Fazendo / Feito. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  colunas?: string[];
}

export class UpdateQuadroDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nome?: string;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  posicao?: number;

  /** null volta ao fundo padrao. */
  @IsOptional()
  @IsIn([...FUNDOS_QUADRO, null], { message: 'fundo invalido' })
  fundo?: string | null;
}

export class UpdateFundoProducaoDto {
  @IsIn([...FUNDOS_QUADRO, null], { message: 'fundo invalido' })
  fundo: string | null;
}

export class CreateColunaDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nome: string;
}

export class UpdateColunaDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nome?: string;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  posicao?: number;
}

export class RemoveColunaQueryDto {
  /** Coluna do mesmo quadro que recebe os cards da coluna apagada. */
  @IsOptional()
  @IsUUID('4')
  moverPara?: string;
}
