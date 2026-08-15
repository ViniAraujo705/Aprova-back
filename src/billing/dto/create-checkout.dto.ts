import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
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

  // Telefone brasileiro com DDD, somente dígitos. A Asaas exige esse dado
  // para criar o Customer no Checkout em produção.
  @Matches(/^\d{10,11}$/, {
    message: 'phoneNumber deve conter DDD e 10 ou 11 digitos, sem pontuacao',
  })
  phoneNumber: string;

  @Matches(/^\d{8}$/, {
    message: 'postalCode deve conter 8 digitos, sem pontuacao',
  })
  postalCode: string;

  @IsString()
  @MaxLength(120)
  address: string;

  @IsString()
  @MaxLength(20)
  addressNumber: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  complement?: string;

  // Bairro. A Asaas o chama de province no customerData.
  @IsString()
  @MaxLength(100)
  province: string;
}
