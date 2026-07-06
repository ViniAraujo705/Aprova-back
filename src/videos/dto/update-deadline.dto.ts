import { IsISO8601, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateDeadlineDto {
  @ApiProperty({
    required: false,
    nullable: true,
    description:
      'Prazo de entrega (ISO 8601). Enviar null remove o prazo.',
    example: '2026-08-15',
  })
  @IsOptional()
  @IsISO8601()
  deadline: string | null;
}
