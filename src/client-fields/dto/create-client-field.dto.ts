import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateClientFieldDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  rotulo: string;
}
