import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreatePortfolioCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nome: string;
}
