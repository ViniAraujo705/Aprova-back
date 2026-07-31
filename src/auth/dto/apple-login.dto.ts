import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AppleLoginDto {
  // Identity token (JWT) retornado pelo Sign in with Apple no app cliente.
  @IsString()
  @IsNotEmpty()
  identityToken: string;

  // Apple so envia o nome do usuario na primeira autorizacao (via
  // ASAuthorizationAppleIDCredential.fullName no client) - nunca no token.
  // O frontend deve reenviar aqui nesse primeiro momento para criarmos a conta com nome.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nome?: string;

  // Nome da agencia (Account), usado apenas na criacao da conta (primeiro login).
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nomeAgencia?: string;
}
