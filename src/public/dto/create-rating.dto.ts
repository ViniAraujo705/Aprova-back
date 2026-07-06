import { IsEnum, IsInt, Max, Min } from 'class-validator';
import { RatingCategory } from '@prisma/client';

export class CreateRatingDto {
  @IsEnum(RatingCategory, {
    message: 'categoria deve ser: iluminacao, audio ou enquadramento',
  })
  categoria: RatingCategory;

  @IsInt()
  @Min(1, { message: 'nota minima e 1' })
  @Max(5, { message: 'nota maxima e 5' })
  nota: number;
}
