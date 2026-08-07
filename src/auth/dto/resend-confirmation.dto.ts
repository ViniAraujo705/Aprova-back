import { IsEmail } from 'class-validator';

export class ResendConfirmationDto {
  @IsEmail({}, { message: 'Email invalido' })
  email: string;
}
