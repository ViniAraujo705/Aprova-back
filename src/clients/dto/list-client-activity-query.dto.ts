import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ListClientActivityQueryDto {
  // Id do ultimo item recebido pelo frontend - retoma a listagem apos ele.
  @IsOptional()
  @IsUUID('4', { message: 'cursor invalido' })
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 30;
}
