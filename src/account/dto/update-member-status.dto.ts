import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';

export class UpdateMemberStatusDto {
  @ApiProperty({
    enum: UserStatus,
    description: 'ativo = reativa o membro; suspenso = remove/suspende.',
  })
  @IsEnum(UserStatus, { message: 'status deve ser: ativo ou suspenso' })
  status: UserStatus;
}
