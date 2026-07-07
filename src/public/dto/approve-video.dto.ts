import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ApproveVideoDto {
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'notaGeral minima e 1' })
  @Max(5, { message: 'notaGeral maxima e 5' })
  notaGeral?: number;
}
