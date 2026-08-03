import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoConfig, PreApproval } from 'mercadopago';

export interface CreatePreapprovalParams {
  reason: string;
  payerEmail: string;
  externalReference: string;
  backUrl: string;
  transactionAmount: number;
  frequency: number;
  frequencyType: 'months';
}

/**
 * Wrapper fino sobre o SDK oficial da Mercado Pago (pacote `mercadopago`).
 * O ambiente (teste vs producao) e definido pelo prefixo do proprio
 * access token (TEST-... ou APP_USR-...), nao por config separada aqui.
 */
@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);
  private readonly preApproval: PreApproval;

  constructor(config: ConfigService) {
    const mpConfig = new MercadoPagoConfig({
      accessToken: config.get<string>('MERCADOPAGO_ACCESS_TOKEN') ?? '',
    });
    this.preApproval = new PreApproval(mpConfig);
  }

  async createPreapproval(params: CreatePreapprovalParams) {
    return this.run('criar assinatura', () =>
      this.preApproval.create({
        body: {
          reason: params.reason,
          payer_email: params.payerEmail,
          external_reference: params.externalReference,
          back_url: params.backUrl,
          auto_recurring: {
            frequency: params.frequency,
            frequency_type: params.frequencyType,
            transaction_amount: params.transactionAmount,
            currency_id: 'BRL',
          },
        },
      }),
    );
  }

  async getPreapproval(id: string) {
    return this.run('buscar assinatura', () => this.preApproval.get({ id }));
  }

  async cancelPreapproval(id: string) {
    return this.run('cancelar assinatura', () =>
      this.preApproval.update({ id, body: { status: 'cancelled' } }),
    );
  }

  private async run<T>(action: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const message = this.extractMessage(err);
      this.logger.error(`Mercado Pago falhou ao ${action}: ${message}`);
      throw new BadGatewayException(
        `Falha ao ${action} na Mercado Pago: ${message}`,
      );
    }
  }

  private extractMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String(err.message);
    }
    return err instanceof Error ? err.message : 'erro desconhecido';
  }
}
