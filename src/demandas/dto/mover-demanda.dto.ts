import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { EtapaProducao } from '@prisma/client';

/**
 * Destino de um card: quadroId null = quadro de producao (usa `etapa`);
 * senao um quadro extra (usa `colunaId`, ou a primeira coluna).
 */
export class DestinoDemandaDto {
  @IsOptional()
  @IsUUID('4', { message: 'quadroId invalido' })
  quadroId?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'colunaId invalido' })
  colunaId?: string | null;

  @IsOptional()
  @IsEnum(EtapaProducao, { message: 'etapa invalida' })
  etapa?: EtapaProducao;

  /** Sem posicao: vai para o fim da coluna. */
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  posicao?: number;
}

export class MoverDemandaDto extends DestinoDemandaDto {}

export class CopiarDemandaDto extends DestinoDemandaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  titulo: string;

  @IsOptional()
  @IsBoolean()
  manterChecklist?: boolean;

  @IsOptional()
  @IsBoolean()
  manterEtiquetas?: boolean;

  @IsOptional()
  @IsBoolean()
  manterMembros?: boolean;
}
