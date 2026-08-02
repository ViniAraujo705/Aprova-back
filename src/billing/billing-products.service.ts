import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AbacatePayService } from './abacatepay/abacatepay.service';
import {
  BillableCycle,
  BillablePlan,
  PLAN_PRODUCTS,
} from './plan-products.config';

interface ResolvedProduct {
  plan: BillablePlan;
  cycle: BillableCycle;
  productId: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Resolve o mapeamento entre (plan, cycle) do Vistoow e o productId real da
 * AbacatePay (que difere entre sandbox e producao). Cacheado em memoria
 * porque essa lista quase nunca muda.
 */
@Injectable()
export class BillingProductsService {
  private readonly logger = new Logger(BillingProductsService.name);
  private cache: ResolvedProduct[] | null = null;
  private cachedAt = 0;

  constructor(private readonly abacatepay: AbacatePayService) {}

  /** Cria na AbacatePay os produtos que ainda nao existem. Idempotente. */
  async ensureProducts(): Promise<{
    created: string[];
    alreadyExisted: string[];
  }> {
    const existing = await this.abacatepay.listProducts();
    const byExternalId = new Map(
      existing
        .filter((p) => p.externalId)
        .map((p) => [p.externalId as string, p]),
    );

    const created: string[] = [];
    const alreadyExisted: string[] = [];

    for (const plan of Object.keys(PLAN_PRODUCTS) as BillablePlan[]) {
      for (const cycle of Object.keys(PLAN_PRODUCTS[plan]) as BillableCycle[]) {
        const def = PLAN_PRODUCTS[plan][cycle];
        if (byExternalId.has(def.externalId)) {
          alreadyExisted.push(def.externalId);
          continue;
        }
        await this.abacatepay.createProduct({
          externalId: def.externalId,
          name: def.name,
          price: def.priceCents,
          cycle,
        });
        created.push(def.externalId);
        this.logger.log(`Produto criado na AbacatePay: ${def.externalId}`);
      }
    }

    this.cache = null;
    return { created, alreadyExisted };
  }

  async resolveProductId(
    plan: BillablePlan,
    cycle: BillableCycle,
  ): Promise<string> {
    const products = await this.getCachedProducts();
    const match = products.find((p) => p.plan === plan && p.cycle === cycle);
    if (!match) {
      const def = PLAN_PRODUCTS[plan][cycle];
      throw new NotFoundException(
        `Produto "${def.externalId}" nao encontrado na AbacatePay. Rode POST /admin/billing/sync-products primeiro.`,
      );
    }
    return match.productId;
  }

  async resolvePlanFromProductId(
    productId: string,
  ): Promise<{ plan: BillablePlan; cycle: BillableCycle } | null> {
    const products = await this.getCachedProducts();
    const match = products.find((p) => p.productId === productId);
    return match ? { plan: match.plan, cycle: match.cycle } : null;
  }

  private async getCachedProducts(): Promise<ResolvedProduct[]> {
    if (this.cache && Date.now() - this.cachedAt < CACHE_TTL_MS) {
      return this.cache;
    }

    const remote = await this.abacatepay.listProducts();
    const byExternalId = new Map(
      remote
        .filter((p) => p.externalId)
        .map((p) => [p.externalId as string, p]),
    );

    const resolved: ResolvedProduct[] = [];
    for (const plan of Object.keys(PLAN_PRODUCTS) as BillablePlan[]) {
      for (const cycle of Object.keys(PLAN_PRODUCTS[plan]) as BillableCycle[]) {
        const product = byExternalId.get(PLAN_PRODUCTS[plan][cycle].externalId);
        if (product) {
          resolved.push({ plan, cycle, productId: product.id });
        }
      }
    }

    this.cache = resolved;
    this.cachedAt = Date.now();
    return resolved;
  }
}
