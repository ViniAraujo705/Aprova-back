import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AcceptInviteDto {
  @ApiProperty({ description: 'Nome do editor.', example: 'Maria Silva' })
  @IsString()
  @IsNotEmpty()
  nome: string;

  @ApiProperty({ description: 'Senha (mínimo 6 caracteres).', minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'A senha deve ter ao menos 6 caracteres' })
  senha: string;
}
