import { IsIn, IsNotEmpty, IsString } from 'class-validator';

// A foto do projeto e uma miniatura: o frontend ja recorta em 1:1 e comprime
// pra JPEG antes de subir, entao nao ha caso de uso pra SVG aqui (diferente
// do logo do branding, que aceita vetor).
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export class ProjectPhotoUploadUrlDto {
  @IsString()
  @IsNotEmpty()
  nomeArquivo: string;

  @IsIn(ALLOWED_IMAGE_TYPES, {
    message: `contentType deve ser um dos seguintes: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
  })
  contentType: string;
}
