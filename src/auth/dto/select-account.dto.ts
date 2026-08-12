import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SelectAccountDto {
  @ApiProperty({
    description: 'Id da conta (agencia) a tornar ativa no token emitido.',
  })
  @IsUUID()
  accountId: string;
}
