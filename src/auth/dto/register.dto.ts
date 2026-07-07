import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsEmail({}, { message: 'Email invalido' })
  email: string;

  @IsString()
  @MinLength(6, { message: 'A senha deve ter ao menos 6 caracteres' })
  senha: string;

  // Nome da agencia (Account). Se omitido, usa o nome do usuario.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nomeAgencia?: string;
}
