import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveMx } from 'dns/promises';

/**
 * Envio de e-mail transacional via Resend (API REST simples, sem SDK).
 * Sem RESEND_API_KEY configurada (dev/local), o envio e apenas simulado
 * via log - mesmo padrao ja usado para o inviteUrl em AccountService.invite.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey?: string;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('RESEND_API_KEY') || undefined;
    this.from =
      this.config.get<string>('MAIL_FROM') ?? 'Aprova <no-reply@aprova.app>';
  }

  async send(to: string, subject: string, text: string): Promise<void> {
    await this.assertDomainAcceitaEmail(to);

    if (!this.apiKey) {
      this.logger.log(
        `[EMAIL SIMULADO] Para ${to}. Assunto: ${subject}\n${text}`,
      );
      return;
    }

    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: this.from, to: [to], subject, text }),
      });
    } catch (err) {
      this.logger.error(
        `Falha ao chamar o provedor de e-mail: ${(err as Error).message}`,
      );
      throw new BadGatewayException(
        'Falha ao enviar e-mail: provedor indisponivel',
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(
        `Provedor de e-mail respondeu ${response.status}: ${body}`,
      );
      throw new BadGatewayException(
        'Falha ao enviar e-mail: provedor recusou o envio',
      );
    }
  }

  /**
   * Confirma que o dominio do email possui registro MX antes de tentar o
   * envio. Nao garante que a caixa especifica existe, mas descarta
   * dominios inexistentes ou sem servidor de email configurado.
   */
  private async assertDomainAcceitaEmail(email: string): Promise<void> {
    const domain = email.split('@')[1];
    if (!domain) {
      throw new BadRequestException('Email invalido');
    }

    try {
      const records = await resolveMx(domain);
      if (!records || records.length === 0) {
        throw new BadRequestException(
          `Dominio de email nao aceita mensagens: ${domain}`,
        );
      }
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      throw new BadRequestException(
        `Dominio de email invalido ou inexistente: ${domain}`,
      );
    }
  }
}
