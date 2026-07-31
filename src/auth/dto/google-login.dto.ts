import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GoogleLoginDto {
  // ID token retornado pelo Google Sign-In no app cliente (nao o access_token).
  @IsString()
  @IsNotEmpty()
  idToken: string;

  // Nome da agencia (Account), usado apenas se esta for a primeira vez
  // que esse usuario autentica (cria conta). Se omitido, usa o nome do perfil Google.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nomeAgencia?: string;
}
