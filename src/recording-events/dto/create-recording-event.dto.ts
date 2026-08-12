import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { RecordingEventTipo } from '@prisma/client';

export class CreateRecordingEventDto {
  @IsString()
  @IsNotEmpty()
  titulo: string;

  @IsOptional()
  @IsEnum(RecordingEventTipo, { message: 'tipo invalido' })
  tipo?: RecordingEventTipo;

  @IsDateString()
  dataInicio: string;

  @IsOptional()
  @IsDateString()
  dataFim?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'clienteId invalido' })
  clienteId?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'membroId invalido' })
  membroId?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'equipeIds invalido' })
  equipeIds?: string[];

  @IsOptional()
  @IsUUID('4', { message: 'demandaId invalido' })
  demandaId?: string | null;

  @IsOptional()
  @IsString()
  observacoes?: string | null;
}
