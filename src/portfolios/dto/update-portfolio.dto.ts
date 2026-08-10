import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
} from 'class-validator';

export class UpdatePortfolioDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nome?: string;

  // null limpa a descricao; ausente deixa como esta (ver PortfoliosService.update)
  @IsOptional()
  @IsString()
  descricao?: string | null;

  // null limpa a categoria; ausente deixa como esta
  @IsOptional()
  @IsUUID('4', { message: 'categoriaId invalido' })
  categoriaId?: string | null;

  // Setado a partir da publicUrl de POST /portfolios/:id/cover-upload-url.
  // null remove a capa explicita (volta a cair no fallback do primeiro item).
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'capaUrl deve ser uma URL valida' })
  capaUrl?: string | null;

  // Etiqueta o album com a marca de um cliente especifico (so sinalizacao
  // de marca - ver Portfolio.clienteId). null remove a etiqueta; ausente
  // deixa como esta. So aceito em PATCH: todo album novo nasce sem cliente.
  @IsOptional()
  @IsUUID('4', { message: 'clienteId invalido' })
  clienteId?: string | null;
}
