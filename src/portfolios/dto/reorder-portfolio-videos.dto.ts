import { ArrayNotEmpty, IsUUID } from 'class-validator';

export class ReorderPortfolioVideosDto {
  // Ordem completa desejada - a posicao no array vira o novo `ordem` de cada item
  @ArrayNotEmpty()
  @IsUUID('4', { each: true, message: 'videoIds deve conter apenas UUIDs' })
  videoIds: string[];
}
