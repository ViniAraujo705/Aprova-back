import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class AcceptInviteDto {
  @ApiPropertyOptional({
    description:
      'Nome do editor. Obrigatorio para quem ainda nao tem conta no sistema; ignorado quando o email do convite ja pertence a um usuario existente.',
    example: 'Maria Silva',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nome?: string;

  @ApiProperty({
    description:
      'Senha. Para quem ainda nao tem conta, e a senha nova (minimo 6 caracteres). Para quem ja tem conta em outra agencia, e a senha atual dessa conta, usada para confirmar identidade.',
    minLength: 6,
  })
  @IsString()
  @MinLength(6, { message: 'A senha deve ter ao menos 6 caracteres' })
  senha: string;
}
