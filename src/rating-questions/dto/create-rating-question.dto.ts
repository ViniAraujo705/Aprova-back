import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateRatingQuestionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  texto: string;
}
