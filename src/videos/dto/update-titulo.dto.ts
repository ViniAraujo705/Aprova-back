import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateTituloDto {
  @IsString()
  @IsNotEmpty()
  nomeArquivo: string;
}
