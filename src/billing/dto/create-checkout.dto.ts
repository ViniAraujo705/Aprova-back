import { IsIn } from 'class-validator';
import { BillableCycle, BillablePlan } from '../plan-products.config';

export class CreateCheckoutDto {
  @IsIn(['pro', 'agencia'], { message: 'plan deve ser: pro ou agencia' })
  plan: BillablePlan;

  @IsIn(['MONTHLY', 'ANNUALLY'], {
    message: 'cycle deve ser: MONTHLY ou ANNUALLY',
  })
  cycle: BillableCycle;
}
