import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateMemberRoleDto {
  @ApiProperty({
    enum: ['owner'],
    description:
      'Somente "owner" e suportado: promove um editor a owner. Rebaixar um owner a editor nao e suportado por este endpoint.',
  })
  @IsIn(['owner'], { message: 'teamRole deve ser: owner' })
  teamRole: 'owner';
}
