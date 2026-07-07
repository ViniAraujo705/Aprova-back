import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class CreateRatingDto {
  @IsUUID('4', { message: 'ratingQuestionId invalido' })
  ratingQuestionId: string;

  @IsInt()
  @Min(1, { message: 'nota minima e 1' })
  @Max(5, { message: 'nota maxima e 5' })
  nota: number;
}
