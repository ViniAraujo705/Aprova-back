import { ConfigService } from '@nestjs/config';

/**
 * Padrao de desenvolvimento: o front e Next e sobe na 3000. O valor antigo
 * (5173, porta do Vite) era residuo de outro setup e nunca esteve certo nem
 * pra rodar local.
 *
 * Nao vale em producao — la a ausencia de FRONTEND_URL derruba o boot, ver
 * validateFrontendUrl.
 */
const DEV_FRONTEND_URL = 'http://localhost:3000';

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
}

/**
 * Dominio canonico do frontend, usado para montar todo link que chega ao
 * usuario (convite, reset de senha, confirmacao de e-mail, retorno do
 * checkout, callback das integracoes Google).
 *
 * FRONTEND_URL e a unica fonte da verdade. **Nao ha mais fallback para a
 * primeira origem do CORS_ORIGIN**: aquela lista existe pra outra finalidade
 * e a ordem dela nao e contrato nenhum — durante a troca de dominio os links
 * sairam certos so porque o dominio novo por acaso estava em primeiro, e
 * bastava reordenar a lista pra todo convite sair errado sem ninguem tocar
 * nesta variavel.
 */
export function resolveFrontendUrl(config: ConfigService): string {
  const explicit = normalize(config.get<string>('FRONTEND_URL'));
  if (explicit) return explicit;
  // Em producao o boot ja teria falhado, entao chegar aqui e desenvolvimento.
  return DEV_FRONTEND_URL;
}

/**
 * Validacao de boot (ConfigModule.validate no AppModule). Deliberadamente
 * aqui e nao dentro de resolveFrontendUrl: um throw na hora de montar o link
 * viraria um 500 no pedido de reset de senha, com o deploy no ar e ninguem
 * sabendo. Falhando no boot, o Railway nao promove a versao mal configurada.
 *
 * O motivo de existir: em 2026-07-17 um reset de senha saiu com
 * `http://localhost:5173/redefinir-senha/...` para uma caixa real.
 */
export function validateFrontendUrl<T extends Record<string, unknown>>(
  env: T,
): T {
  const url = normalize(env.FRONTEND_URL);

  if (env.NODE_ENV === 'production' && !url) {
    throw new Error(
      'FRONTEND_URL e obrigatoria quando NODE_ENV=production: e o dominio ' +
        'canonico de todo link enviado ao usuario (convite, reset de senha, ' +
        'confirmacao de e-mail, retorno do checkout, callbacks Google).',
    );
  }

  if (url && !/^https?:\/\/[^/]/.test(url)) {
    throw new Error(
      `FRONTEND_URL deve ser uma URL absoluta com http:// ou https:// (recebido: "${url}")`,
    );
  }

  return env;
}
