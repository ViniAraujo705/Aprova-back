import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  nome: string;

  /**
   * Ausente/nulo = projeto avulso: o link publico funciona igual, sem
   * precisar cadastrar o cliente antes.
   */
  @IsOptional()
  @IsUUID('4', { message: 'client_id invalido' })
  clientId?: string | null;

  /** Nome livre de quem recebe o link do projeto avulso (opcional). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contatoAvulso?: string | null;

  /**
   * Miniatura interna do projeto - a publicUrl devolvida por
   * POST /projects/:id/photo-upload-url. No PATCH, `null` remove a foto e a
   * chave ausente deixa como esta (@IsOptional ignora ambos os casos).
   */
  @IsOptional()
  @IsString()
  fotoUrl?: string | null;
}
