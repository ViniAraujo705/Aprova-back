import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsString,
} from 'class-validator';

/** Teto por request - evita um zip gigante travar o processo web. */
export const MAX_VIDEOS_POR_DOWNLOAD = 50;

export class DownloadVideosDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'Informe ao menos um video em videoLinks' })
  @ArrayMaxSize(MAX_VIDEOS_POR_DOWNLOAD, {
    message: `No maximo ${MAX_VIDEOS_POR_DOWNLOAD} videos por download`,
  })
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  videoLinks: string[];
}
