import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInviteDto {
  @ApiProperty({
    description: 'Email do editor a ser convidado para a agência.',
    example: 'editor@agencia.com',
  })
  @IsEmail({}, { message: 'Email invalido' })
  email: string;
}
