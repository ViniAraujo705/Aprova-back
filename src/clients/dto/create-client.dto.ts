import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class CreateClientDto {
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsEmail({}, { message: 'Email invalido' })
  email: string;
}
