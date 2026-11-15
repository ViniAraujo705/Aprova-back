import { Injectable, Logger } from '@nestjs/common';
import { Plan, UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AsaasPaymentDetail,
  AsaasService,
} from '../billing/asaas/asaas.service';
import {
  BillableCycle,
  BillablePlan,
  PLAN_BILLING,
} from '../billing/plan-billing.config';

/**
 * Situacao financeira de uma conta, derivada dos campos asaas* de Account
 * (ver BillingService.processWebhook):
 * - pagante: assinatura confirmada e plano em vigor = plano contratado
 * - inadimplente: assinatura existe, mas cobranca vencida derrubou pro free
 *   (ou a Asaas tem cobranca OVERDUE pro customer)
 * - checkout_pendente: abriu o checkout e nunca pagou a primeira cobranca
 * - cortesia: plano pago sem assinatura (liberado a mao pelo admin)
 * - gratis: free/portfolio sem cobranca
 */
export type SituacaoFinanceira =
  'pagante' | 'inadimplente' | 'checkout_pendente' | 'cortesia' | 'gratis';

const TZ = 'America/Sao_Paulo';
const DAY_MS = 24 * 60 * 60 * 1000;
const ASAAS_CACHE_MS = 60_000;

const dayKey = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d); // YYYY-MM-DD
const monthKey = (d: Date) => dayKey(d).slice(0, 7);

const round2 = (n: number) => Math.round(n * 100) / 100;

function cycleOf(raw: string | null): BillableCycle {
  return raw === 'YEARLY' ? 'YEARLY' : 'MONTHLY';
}

/** Valor mensal equivalente (anual / 12) de um plano contratado. */
function monthlyValue(plan: Plan | null, cycle: string | null): number {
  if (!plan || !(plan in PLAN_BILLING)) return 0;
  const def = PLAN_BILLING[plan as BillablePlan][cycleOf(cycle)];
  return def.cycle === 'YEARLY' ? def.value / 12 : def.value;
}

function cycleValue(plan: Plan | null, cycle: string | null): number {
  if (!plan || !(plan in PLAN_BILLING)) return 0;
  return PLAN_BILLING[plan as BillablePlan][cycleOf(cycle)].value;
}

interface AsaasSnapshot {
  disponivel: boolean;
  erro: string | null;
  saldo: number | null;
  recebidos: AsaasPaymentDetail[]; // pagas nos ultimos ~13 meses
  pendentes: AsaasPaymentDetail[];
  vencidas: AsaasPaymentDetail[];
}

@Injectable()
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name);
  private asaasCache: { at: number; data: AsaasSnapshot } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly asaas: AsaasService,
  ) {}

  async getDashboard() {
    const now = new Date();
    const [accounts, lastAccess, videosByAccount, totalUsers, asaas] =
      await Promise.all([
        this.prisma.account.findMany({
          orderBy: { criadoEm: 'desc' },
          select: {
            id: true,
            nomeAgencia: true,
            plan: true,
            asaasPlan: true,
            asaasCycle: true,
            asaasCustomerId: true,
            asaasSubscriptionId: true,
            criadoEm: true,
            memberships: {
              where: { role: { in: [UserRole.owner, UserRole.admin] } },
              orderBy: { criadoEm: 'asc' },
              take: 1,
              select: {
                role: true,
                user: {
                  select: {
                    id: true,
                    nome: true,
                    email: true,
                    status: true,
                    emailVerificadoEm: true,
                    googleId: true,
                    appleId: true,
                  },
                },
              },
            },
            _count: {
              select: { clients: true, projects: true, memberships: true },
            },
          },
        }),
        this.prisma.session.groupBy({
          by: ['userId'],
          _max: { ultimoAcessoEm: true },
        }),
        this.prisma.project.findMany({
          select: { accountId: true, _count: { select: { videos: true } } },
        }),
        this.prisma.user.count(),
        this.getAsaasSnapshot(),
      ]);

    const lastAccessByUser = new Map(
      lastAccess.map((s) => [s.userId, s._max.ultimoAcessoEm]),
    );
    const videos = new Map<string, number>();
    for (const p of videosByAccount) {
      videos.set(p.accountId, (videos.get(p.accountId) ?? 0) + p._count.videos);
    }

    const overdueByCustomer = new Map<string, AsaasPaymentDetail[]>();
    for (const p of asaas.vencidas) {
      const list = overdueByCustomer.get(p.customer) ?? [];
      list.push(p);
      overdueByCustomer.set(p.customer, list);
    }

    // Contas da plataforma (a conta do proprio admin, criada pelo seed, fica
    // de fora das metricas de negocio).
    const contas = accounts
      .filter((a) => a.memberships[0]?.role !== UserRole.admin)
      .map((a) => {
        const owner = a.memberships[0]?.user ?? null;
        const vencidasAsaas = a.asaasCustomerId
          ? (overdueByCustomer.get(a.asaasCustomerId) ?? [])
          : [];

        let situacao: SituacaoFinanceira;
        if (
          vencidasAsaas.length > 0 ||
          (a.asaasPlan && a.asaasSubscriptionId && a.plan === Plan.free)
        ) {
          situacao = 'inadimplente';
        } else if (a.asaasPlan && a.asaasSubscriptionId) {
          situacao = 'pagante';
        } else if (a.asaasPlan) {
          situacao = 'checkout_pendente';
        } else if (a.plan === Plan.pro || a.plan === Plan.agencia) {
          situacao = 'cortesia';
        } else {
          situacao = 'gratis';
        }

        const contratado = a.asaasPlan;
        return {
          id: a.id,
          agencia: a.nomeAgencia,
          customerId: a.asaasCustomerId,
          owner: owner
            ? {
                id: owner.id,
                nome: owner.nome,
                email: owner.email,
                status: owner.status,
                emailConfirmado: Boolean(owner.emailVerificadoEm),
                login: owner.googleId
                  ? 'google'
                  : owner.appleId
                    ? 'apple'
                    : 'email',
              }
            : null,
          plano: a.plan,
          planoContratado: contratado,
          ciclo: contratado ? cycleOf(a.asaasCycle) : null,
          valorCiclo: contratado ? cycleValue(contratado, a.asaasCycle) : 0,
          valorMensal: contratado
            ? round2(monthlyValue(contratado, a.asaasCycle))
            : 0,
          situacao,
          emAberto: round2(vencidasAsaas.reduce((s, p) => s + p.value, 0)),
          criadoEm: a.criadoEm,
          ultimoAcesso: owner ? (lastAccessByUser.get(owner.id) ?? null) : null,
          clientes: a._count.clients,
          projetos: a._count.projects,
          membros: a._count.memberships,
          videos: videos.get(a.id) ?? 0,
        };
      });

    return {
      geradoEm: now,
      inscricoes: this.buildSignups(contas, now),
      planos: this.countBy(contas, (c) => c.plano),
      situacoes: this.countBy(contas, (c) => c.situacao),
      financeiro: this.buildFinance(contas, asaas, now),
      inadimplentes: this.buildDebtors(contas, overdueByCustomer, now),
      usuarios: {
        total: totalUsers,
        suspensos: contas.filter((c) => c.owner?.status === UserStatus.suspenso)
          .length,
        ativos7d: contas.filter(
          (c) =>
            c.ultimoAcesso &&
            now.getTime() - c.ultimoAcesso.getTime() <= 7 * DAY_MS,
        ).length,
        ativos30d: contas.filter(
          (c) =>
            c.ultimoAcesso &&
            now.getTime() - c.ultimoAcesso.getTime() <= 30 * DAY_MS,
        ).length,
      },
      contas,
    };
  }

  private countBy<T>(items: T[], key: (i: T) => string) {
    const out: Record<string, number> = {};
    for (const i of items) out[key(i)] = (out[key(i)] ?? 0) + 1;
    return out;
  }

  private buildSignups(
    contas: { criadoEm: Date; owner: { emailConfirmado: boolean } | null }[],
    now: Date,
  ) {
    const today = dayKey(now);
    const thisMonth = monthKey(now);
    const [ty, tm] = thisMonth.split('-').map(Number);
    const pm = new Date(Date.UTC(ty, tm - 2, 15));
    const previousMonth = `${pm.getUTCFullYear()}-${String(pm.getUTCMonth() + 1).padStart(2, '0')}`;

    const byDay = new Map<string, number>();
    const byMonth = new Map<string, number>();
    for (const c of contas) {
      byDay.set(dayKey(c.criadoEm), (byDay.get(dayKey(c.criadoEm)) ?? 0) + 1);
      byMonth.set(
        monthKey(c.criadoEm),
        (byMonth.get(monthKey(c.criadoEm)) ?? 0) + 1,
      );
    }

    const porDia: { dia: string; total: number }[] = [];
    for (let i = 89; i >= 0; i--) {
      const k = dayKey(new Date(now.getTime() - i * DAY_MS));
      if (porDia.at(-1)?.dia !== k)
        porDia.push({ dia: k, total: byDay.get(k) ?? 0 });
    }

    const porMes: { mes: string; total: number }[] = [];
    const [y, m] = thisMonth.split('-').map(Number);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(y, m - 1 - i, 15));
      const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      porMes.push({ mes: k, total: byMonth.get(k) ?? 0 });
    }

    const within = (days: number) =>
      contas.filter(
        (c) => now.getTime() - c.criadoEm.getTime() <= days * DAY_MS,
      ).length;

    return {
      total: contas.length,
      hoje: byDay.get(today) ?? 0,
      ultimos7: within(7),
      ultimos30: within(30),
      mesAtual: byMonth.get(thisMonth) ?? 0,
      mesAnterior: byMonth.get(previousMonth) ?? 0,
      emailConfirmado: contas.filter((c) => c.owner?.emailConfirmado).length,
      porDia,
      porMes,
    };
  }

  private buildFinance(
    contas: {
      id: string;
      agencia: string;
      customerId: string | null;
      situacao: SituacaoFinanceira;
      planoContratado: Plan | null;
      ciclo: BillableCycle | null;
      valorMensal: number;
    }[],
    asaas: AsaasSnapshot,
    now: Date,
  ) {
    const pagantes = contas.filter((c) => c.situacao === 'pagante');
    const mrr = round2(pagantes.reduce((s, c) => s + c.valorMensal, 0));

    const porPlano = (['portfolio', 'pro', 'agencia'] as const).map((plan) => {
      const doPlano = pagantes.filter((c) => c.planoContratado === plan);
      return {
        plano: plan,
        assinantes: doPlano.length,
        mensais: doPlano.filter((c) => c.ciclo === 'MONTHLY').length,
        anuais: doPlano.filter((c) => c.ciclo === 'YEARLY').length,
        mrr: round2(doPlano.reduce((s, c) => s + c.valorMensal, 0)),
      };
    });

    const thisMonth = monthKey(now);
    const paidDay = (p: AsaasPaymentDetail) =>
      (p.clientPaymentDate ?? p.paymentDate ?? p.dueDate).slice(0, 10);

    const recebidoPorMes = new Map<string, number>();
    for (const p of asaas.recebidos) {
      const k = paidDay(p).slice(0, 7);
      recebidoPorMes.set(k, (recebidoPorMes.get(k) ?? 0) + p.value);
    }
    const [y, m] = thisMonth.split('-').map(Number);
    const receitaPorMes: { mes: string; total: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(y, m - 1 - i, 15));
      const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      receitaPorMes.push({ mes: k, total: round2(recebidoPorMes.get(k) ?? 0) });
    }

    const agenciaByCustomer = new Map(
      contas
        .filter((c) => c.customerId)
        .map((c) => [c.customerId as string, { id: c.id, agencia: c.agencia }]),
    );

    return {
      mrr,
      arr: round2(mrr * 12),
      assinantes: pagantes.length,
      ticketMedio: pagantes.length ? round2(mrr / pagantes.length) : 0,
      mrrEmRisco: round2(
        contas
          .filter((c) => c.situacao === 'inadimplente')
          .reduce((s, c) => s + c.valorMensal, 0),
      ),
      porPlano,
      asaas: {
        disponivel: asaas.disponivel,
        erro: asaas.erro,
        saldo: asaas.saldo,
        recebidoMes: round2(recebidoPorMes.get(thisMonth) ?? 0),
        recebidoMesAnterior: round2(receitaPorMes.at(-2)?.total ?? 0),
        aReceber: round2(asaas.pendentes.reduce((s, p) => s + p.value, 0)),
        vencido: round2(asaas.vencidas.reduce((s, p) => s + p.value, 0)),
        receitaPorMes,
      },
      ultimosPagamentos: [...asaas.recebidos]
        .sort((a, b) => paidDay(b).localeCompare(paidDay(a)))
        .slice(0, 30)
        .map((p) => ({
          id: p.id,
          contaId: agenciaByCustomer.get(p.customer)?.id ?? null,
          agencia: agenciaByCustomer.get(p.customer)?.agencia ?? null,
          valor: p.value,
          liquido: p.netValue ?? null,
          data: paidDay(p),
          forma: p.billingType ?? null,
          descricao: p.description ?? null,
          status: p.status,
        })),
    };
  }

  /**
   * Quem esta devendo, do maior atraso pro menor. Valor e vencimento vem da
   * Asaas; sem ela (ou com webhook de vencida sem cobranca listada) usa o
   * valor do plano contratado e o vencimento fica desconhecido.
   */
  private buildDebtors(
    contas: {
      id: string;
      agencia: string;
      customerId: string | null;
      owner: { nome: string; email: string } | null;
      situacao: SituacaoFinanceira;
      planoContratado: Plan | null;
      ciclo: BillableCycle | null;
      valorCiclo: number;
      ultimoAcesso: Date | null;
    }[],
    overdueByCustomer: Map<string, AsaasPaymentDetail[]>,
    now: Date,
  ) {
    const today = dayKey(now);
    const daysBetween = (from: string) =>
      Math.max(
        0,
        Math.round(
          (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
            DAY_MS,
        ),
      );

    return contas
      .filter((c) => c.situacao === 'inadimplente')
      .map((c) => {
        const cobrancas = (
          c.customerId ? (overdueByCustomer.get(c.customerId) ?? []) : []
        ).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        const maisAntiga = cobrancas[0]?.dueDate ?? null;
        return {
          contaId: c.id,
          agencia: c.agencia,
          nome: c.owner?.nome ?? null,
          email: c.owner?.email ?? null,
          plano: c.planoContratado,
          ciclo: c.ciclo,
          valor: cobrancas.length
            ? round2(cobrancas.reduce((s, p) => s + p.value, 0))
            : c.valorCiclo,
          cobrancas: cobrancas.length,
          vencimento: maisAntiga,
          diasAtraso: maisAntiga ? daysBetween(maisAntiga) : null,
          linkFatura: cobrancas[0]?.invoiceUrl ?? null,
          ultimoAcesso: c.ultimoAcesso,
        };
      })
      .sort((a, b) => (b.diasAtraso ?? -1) - (a.diasAtraso ?? -1));
  }

  /**
   * Busca na Asaas o que nao fica no banco (valores pagos, vencidos, saldo).
   * Fica 60s em cache e nunca derruba o painel: sem Asaas, os numeros do
   * banco continuam aparecendo com `disponivel: false`.
   */
  private async getAsaasSnapshot(): Promise<AsaasSnapshot> {
    if (this.asaasCache && Date.now() - this.asaasCache.at < ASAAS_CACHE_MS) {
      return this.asaasCache.data;
    }
    const since = new Date(Date.now() - 400 * DAY_MS)
      .toISOString()
      .slice(0, 10);
    try {
      const [confirmados, recebidos, pendentes, vencidas, saldo] =
        await Promise.all([
          this.asaas.listPayments({
            status: 'CONFIRMED',
            'paymentDate[ge]': since,
          }),
          this.asaas.listPayments({
            status: 'RECEIVED',
            'paymentDate[ge]': since,
          }),
          this.asaas.listPayments({ status: 'PENDING' }),
          this.asaas.listPayments({ status: 'OVERDUE' }),
          this.asaas.getBalance().catch(() => null),
        ]);
      const data: AsaasSnapshot = {
        disponivel: true,
        erro: null,
        saldo,
        recebidos: [...confirmados, ...recebidos],
        pendentes,
        vencidas,
      };
      this.asaasCache = { at: Date.now(), data };
      return data;
    } catch (err) {
      const erro = err instanceof Error ? err.message : 'erro desconhecido';
      this.logger.warn(`Painel admin sem dados da Asaas: ${erro}`);
      return {
        disponivel: false,
        erro,
        saldo: null,
        recebidos: [],
        pendentes: [],
        vencidas: [],
      };
    }
  }
}
