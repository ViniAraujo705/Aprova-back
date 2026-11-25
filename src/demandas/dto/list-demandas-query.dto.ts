import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsOptional, IsUUID } from 'class-validator';

export class ListDemandasQueryDto {
  /** true = so as arquivadas; omitido/false = so as ativas do quadro. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  arquivadas?: boolean;

  /** Quadro extra; omitido = quadro de producao. */
  @IsOptional()
  @IsUUID('4', { message: 'quadroId invalido' })
  quadroId?: string;
}

/** Planejador do Kanban: cards com prazo no intervalo, de todos os quadros. */
export class AgendaDemandasQueryDto {
  @IsDateString({}, { message: 'de invalido' })
  de: string;

  @IsDateString({}, { message: 'ate invalido' })
  ate: string;
}
