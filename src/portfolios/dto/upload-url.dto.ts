import { IsIn, IsNotEmpty, IsString } from 'class-validator';

// Mesmos tipos de video aceitos em POST /videos/upload-url, mais imagem -
// upload dedicado do portfolio serve tanto video quanto foto (ver
// PortfolioUploadCompleteDto.tipoMidia).
const ALLOWED_PORTFOLIO_UPLOAD_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/mpeg',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export class PortfolioUploadUrlDto {
  @IsString()
  @IsNotEmpty()
  nomeArquivo: string;

  @IsIn(ALLOWED_PORTFOLIO_UPLOAD_TYPES, {
    message: `contentType deve ser um dos seguintes: ${ALLOWED_PORTFOLIO_UPLOAD_TYPES.join(', ')}`,
  })
  contentType: string;
}
