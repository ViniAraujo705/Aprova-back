import { IsEnum, IsNumber, IsOptional } from 'class-validator';
import { EtapaProducao } from '@prisma/client';

export class UpdateDemandaEtapaDto {
  @IsEnum(EtapaProducao, {
    message:
      'etapa deve ser: planejado, producao, edicao, aguardando_aprovacao, ajustes, aprovado ou entregue',
  })
  etapa: EtapaProducao;

  /**
   * Posicao do card dentro da coluna (ordem crescente). O front manda o meio
   * entre os vizinhos; sem isso o card mantem a posicao atual.
   */
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  posicao?: number;
}
