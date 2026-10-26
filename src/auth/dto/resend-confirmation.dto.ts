import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

export class ResendConfirmationDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Email invalido' })
  email: string;
}
