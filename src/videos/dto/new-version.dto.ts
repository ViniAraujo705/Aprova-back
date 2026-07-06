import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Nova versao de um video existente. O projeto e a versao sao herdados
 * do video pai (referenciado por :id na rota), entao so precisamos do
 * arquivo recem enviado ao R2.
 */
export class NewVersionDto {
  @IsString()
  @IsNotEmpty()
  urlStorage: string;

  @IsString()
  @IsNotEmpty()
  nomeArquivo: string;
}
