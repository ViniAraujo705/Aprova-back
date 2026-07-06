import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Email invalido' })
  email: string;

  @IsString()
  @IsNotEmpty()
  senha: string;
}
