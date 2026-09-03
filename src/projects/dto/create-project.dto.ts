import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsUUID('4', { message: 'client_id invalido' })
  clientId: string;

  /**
   * Miniatura interna do projeto - a publicUrl devolvida por
   * POST /projects/:id/photo-upload-url. No PATCH, `null` remove a foto e a
   * chave ausente deixa como esta (@IsOptional ignora ambos os casos).
   */
  @IsOptional()
  @IsString()
  fotoUrl?: string | null;
}
