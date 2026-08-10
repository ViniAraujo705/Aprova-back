import { IsIn, Matches } from 'class-validator';
import { BillableCycle, BillablePlan } from '../plan-billing.config';

export class CreateCheckoutDto {
  @IsIn(['pro', 'agencia'], { message: 'plan deve ser: pro ou agencia' })
  plan: BillablePlan;

  @IsIn(['MONTHLY', 'YEARLY'], {
    message: 'cycle deve ser: MONTHLY ou YEARLY',
  })
  cycle: BillableCycle;

  // Apenas digitos (11 = CPF, 14 = CNPJ), sem pontuacao — o frontend deve
  // limpar antes de enviar. Exigido pela Asaas para criar o Customer.
  @Matches(/^\d{11}$|^\d{14}$/, {
    message:
      'cpfCnpj deve conter 11 digitos (CPF) ou 14 digitos (CNPJ), sem pontuacao',
  })
  cpfCnpj: string;
}
