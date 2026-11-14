import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

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
