import { IsEnum } from 'class-validator';
import { EtapaProducao } from '@prisma/client';

export class UpdateDemandaEtapaDto {
  @IsEnum(EtapaProducao, {
    message:
      'etapa deve ser: planejado, producao, edicao, aguardando_aprovacao, ajustes, aprovado ou entregue',
  })
  etapa: EtapaProducao;
}
