import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCommentDto {
  // Momento do video em segundos ao qual o comentario se refere
  @IsInt()
  @Min(0)
  timestampVideo: number;

  // Opcional: o mic e uma alternativa ao campo de texto, nao obrigatorio
  // os dois juntos (ver audioUrl). Validacao de "pelo menos um dos dois"
  // fica no service.
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  texto?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  autorNome: string;

  // URL publica (R2) do audio do comentario, obtida via
  // POST /public/videos/:linkPublico/comments/audio-upload-url.
  @IsOptional()
  @IsString()
  @IsUrl(
    { require_tld: false },
    { message: 'audioUrl deve ser uma URL válida' },
  )
  @MaxLength(2048)
  audioUrl?: string;
}
