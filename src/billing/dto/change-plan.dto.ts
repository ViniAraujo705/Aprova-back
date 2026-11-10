import { IsIn } from 'class-validator';
import { BillablePlan } from '../plan-billing.config';

export class ChangePlanDto {
  @IsIn(['portfolio', 'pro', 'agencia'], {
    message: 'plan deve ser: portfolio, pro ou agencia',
  })
  plan: BillablePlan;
}
