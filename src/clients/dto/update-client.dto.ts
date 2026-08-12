import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsUUID } from 'class-validator';
import { CreateClientDto } from './create-client.dto';

export class UpdateClientDto extends PartialType(CreateClientDto) {
  /** Profissional da agencia responsavel; `null` remove a atribuicao. */
  @IsOptional()
  @IsUUID('4', { message: 'responsavelId invalido' })
  responsavelId?: string | null;

  /** Alias temporario para compatibilidade com o frontend atual. */
  @IsOptional()
  @IsUUID('4', { message: 'responsibleId invalido' })
  responsibleId?: string | null;
}
