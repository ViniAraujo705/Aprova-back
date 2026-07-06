import { IsEnum } from 'class-validator';
import { UserStatus } from '@prisma/client';

export class UpdateUserStatusDto {
  @IsEnum(UserStatus, { message: 'status deve ser: ativo ou suspenso' })
  status: UserStatus;
}
