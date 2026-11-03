import { IsOptional, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const HEX_MESSAGE = 'cor deve ser um hex válido, ex.: #1E90FF';

/**
 * Cor de cada tipo de evento do calendario (RecordingEventTipo). Uma
 * propriedade por tipo para o `forbidNonWhitelisted` recusar tipos
 * inexistentes. Ausente = nao mexe; null = volta pra cor padrao do sistema.
 */
export class UpdateCalendarColorsDto {
  @ApiPropertyOptional({ example: '#253326', nullable: true })
  @IsOptional()
  @Matches(HEX, { message: HEX_MESSAGE })
  gravacao?: string | null;

  @ApiPropertyOptional({ example: '#38bdf8', nullable: true })
  @IsOptional()
  @Matches(HEX, { message: HEX_MESSAGE })
  captacao?: string | null;

  @ApiPropertyOptional({ example: '#a78bfa', nullable: true })
  @IsOptional()
  @Matches(HEX, { message: HEX_MESSAGE })
  ensaio?: string | null;

  @ApiPropertyOptional({ example: '#f2c14e', nullable: true })
  @IsOptional()
  @Matches(HEX, { message: HEX_MESSAGE })
  reuniao?: string | null;

  @ApiPropertyOptional({ example: '#d6f593', nullable: true })
  @IsOptional()
  @Matches(HEX, { message: HEX_MESSAGE })
  entrega?: string | null;

  @ApiPropertyOptional({ example: '#e8674f', nullable: true })
  @IsOptional()
  @Matches(HEX, { message: HEX_MESSAGE })
  prazo?: string | null;

  @ApiPropertyOptional({ example: '#f472b6', nullable: true })
  @IsOptional()
  @Matches(HEX, { message: HEX_MESSAGE })
  evento?: string | null;

  @ApiPropertyOptional({ example: '#7ea67c', nullable: true })
  @IsOptional()
  @Matches(HEX, { message: HEX_MESSAGE })
  demanda_interna?: string | null;
}
