import { IsUUID } from 'class-validator';

export class ConfirmEmailDto {
  @IsUUID('4', { message: 'token invalido' })
  token: string;
}
