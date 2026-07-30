import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateMeDto {
  @ApiPropertyOptional({
    description: 'Nome do usuario.',
    example: 'Maria Silva',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nome?: string;

  @ApiPropertyOptional({
    description: 'Email do usuario (deve ser unico entre as contas).',
    example: 'maria@agencia.com',
  })
  @IsOptional()
  @IsEmail({}, { message: 'Email invalido' })
  email?: string;

  @ApiPropertyOptional({
    description:
      'URL publica da foto de perfil (apos upload no R2). Envie null para remover.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  fotoUrl?: string | null;
}
