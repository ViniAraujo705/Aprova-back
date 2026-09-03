import { IsIn, IsOptional } from 'class-validator';

/**
 * Qual arquivo o cliente quer baixar:
 * - `original`: o arquivo exatamente como a agencia subiu (qualidade cheia,
 *   pode ser um .MOV HEVC de iPhone);
 * - `otimizado`: a versao MP4 (H.264/AAC) gerada no processamento, muito
 *   menor e reproduzivel em qualquer aparelho.
 */
export const DOWNLOAD_TIPOS = ['original', 'otimizado'] as const;
export type DownloadTipo = (typeof DOWNLOAD_TIPOS)[number];

export class VideoDownloadQueryDto {
  @IsOptional()
  @IsIn(DOWNLOAD_TIPOS, {
    message: `tipo deve ser um dos seguintes: ${DOWNLOAD_TIPOS.join(', ')}`,
  })
  tipo?: DownloadTipo;
}
