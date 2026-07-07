import { IsString, IsUUID, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsUUID('4', { message: 'token invalido' })
  token: string;

  @IsString()
  @MinLength(6, { message: 'A senha deve ter ao menos 6 caracteres' })
  novaSenha: string;
}
