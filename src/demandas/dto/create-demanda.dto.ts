import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { DemandaTipo, EtapaProducao } from '@prisma/client';

export class CreateDemandaDto {
  @IsString()
  @IsNotEmpty()
  titulo: string;

  @IsEnum(DemandaTipo, {
    message: 'tipo deve ser: projeto, campanha, gravacao ou demanda',
  })
  tipo: DemandaTipo;

  @IsOptional()
  @IsUUID('4', { message: 'clienteId invalido' })
  clienteId?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'responsavelId invalido' })
  responsavelId?: string | null;

  @IsOptional()
  @IsDateString()
  prazo?: string | null;

  @IsOptional()
  @IsEnum(EtapaProducao, {
    message:
      'etapa deve ser: planejado, producao, edicao, aguardando_aprovacao, ajustes, aprovado ou entregue',
  })
  etapa?: EtapaProducao;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true, message: 'labelIds deve conter UUIDs validos' })
  labelIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', {
    each: true,
    message: 'collaboratorIds deve conter UUIDs validos',
  })
  collaboratorIds?: string[];
}
