import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsUUID('4', { message: 'client_id invalido' })
  clientId: string;
}
