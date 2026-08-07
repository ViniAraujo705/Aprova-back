import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class AddExistingVideoDto {
  @IsUUID('4', { message: 'videoId invalido' })
  videoId: string;

  // Se omitido, usa o nomeArquivo do video original como titulo
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  titulo?: string;

  @IsOptional()
  @IsString()
  descricao?: string;
}
