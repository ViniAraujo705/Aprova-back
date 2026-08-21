import { IsEnum } from 'class-validator';
import { Plan } from '@prisma/client';

export class UpdateAccountPlanDto {
  @IsEnum(Plan, {
    message: 'plan deve ser: portfolio, free, pro ou agencia',
  })
  plan: Plan;
}
