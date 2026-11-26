import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

/**
 * Armazenamento REAL do bucket R2 para o painel do super admin.
 *
 * O upload vai direto do navegador pro R2, entao o banco nao guarda o tamanho
 * dos arquivos. Aqui listamos o bucket inteiro (key + bytes) e atribuimos
 * cada objeto a uma conta cruzando a key com todas as colunas de URL do
 * schema. Objeto que nenhuma linha referencia vira "nao vinculado" (sobras de
 * upload cancelado, versoes apagadas etc.) - continua custando.
 *
 * Listar o bucket e caro (1 request por 1000 objetos), entao o resultado fica
 * em cache por CACHE_MS; `refresh` força recalcular.
 */

export type StorageCategoria =
  | 'videos'
  | 'videos_otimizados'
  | 'miniaturas'
  | 'portfolio'
  | 'arquivos_clientes'
  | 'anexos_kanban'
  | 'audios'
  | 'checkday'
  | 'marca_fotos';

export const STORAGE_CATEGORIA_LABEL: Record<StorageCategoria, string> = {
  videos: 'Vídeos e fotos enviados (originais)',
  videos_otimizados: 'Versões otimizadas para streaming',
  miniaturas: 'Miniaturas',
  portfolio: 'Portfólio',
  arquivos_clientes: 'Arquivos de clientes',
  anexos_kanban: 'Anexos do kanban',
  audios: 'Áudios de comentários',
  checkday: 'CheckDay',
  marca_fotos: 'Logos, avatares e fotos',
};

const CACHE_MS = 10 * 60 * 1000;
// Cloudflare R2 Standard: US$ 0,015 por GB-mes, 10 GB gratis por mes.
const R2_USD_PER_GB_MONTH = 0.015;
const R2_FREE_GB = 10;
const GB = 1024 ** 3;

interface UrlRow {
  account_id: string;
  url: string;
  categoria: StorageCategoria;
}

interface Bucket {
  bytes: number;
  arquivos: number;
}

export interface StorageReport {
  disponivel: boolean;
  erro: string | null;
  atualizadoEm: string;
  totalBytes: number;
  totalArquivos: number;
  custoEstimadoUsdMes: number;
  porCategoria: {
    categoria: StorageCategoria;
    label: string;
    bytes: number;
    arquivos: number;
  }[];
  porConta: {
    accountId: string;
    nomeAgencia: string;
    plano: string;
    bytes: number;
    arquivos: number;
    porCategoria: Partial<Record<StorageCategoria, number>>;
  }[];
  naoVinculados: Bucket & {
    porPasta: { pasta: string; bytes: number; arquivos: number }[];
  };
}

/** Key do R2 a partir de uma URL publica (qualquer dominio: o r2.dev antigo ou o customizado). */
export function keyFromUrl(url: string): string | null {
  const raw = url.trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) return raw.replace(/^\/+/, '') || null;
  try {
    const path = new URL(raw).pathname.replace(/^\/+/, '');
    return path ? decodeURIComponent(path) : null;
  } catch {
    return null;
  }
}

@Injectable()
export class AdminStorageService {
  private readonly logger = new Logger(AdminStorageService.name);
  private cache: { at: number; report: StorageReport } | null = null;
  private inflight: Promise<StorageReport> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async getReport(refresh = false): Promise<StorageReport> {
    if (!refresh && this.cache && Date.now() - this.cache.at < CACHE_MS) {
      return this.cache.report;
    }
    if (!this.inflight) {
      this.inflight = this.build()
        .then((report) => {
          if (report.disponivel) this.cache = { at: Date.now(), report };
          return report;
        })
        .finally(() => {
          this.inflight = null;
        });
    }
    return this.inflight;
  }


  /**
   * Key do objeto referenciado por uma URL gravada no banco. Tenta, em ordem:
   * a URL publica configurada (R2_PUBLIC_URL), o caminho da URL e o caminho
   * sem o primeiro segmento (URL path-style, com o nome do bucket na frente).
   */
  private resolveKey(url: string, existing: Set<string>): string | null {
    const candidates = [
      this.storage.keyFromPublicUrl(url.trim()),
      keyFromUrl(url),
    ];
    const path = keyFromUrl(url);
    if (path?.includes('/')) candidates.push(path.slice(path.indexOf('/') + 1));
    for (const c of candidates) {
      if (c && existing.has(c)) return c;
      if (c) {
        try {
          const decoded = decodeURIComponent(c);
          if (existing.has(decoded)) return decoded;
        } catch {
          /* key com % literal */
        }
      }
    }
    return null;
  }

  private async build(): Promise<StorageReport> {
    const now = new Date().toISOString();
    let objects: { key: string; size: number }[];
    try {
      objects = await this.storage.listAllObjects();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Falha ao listar o bucket R2: ${msg}`);
      return {
        disponivel: false,
        erro: 'Não foi possível ler o armazenamento (R2).',
        atualizadoEm: now,
        totalBytes: 0,
        totalArquivos: 0,
        custoEstimadoUsdMes: 0,
        porCategoria: [],
        porConta: [],
        naoVinculados: { bytes: 0, arquivos: 0, porPasta: [] },
      };
    }

    const [rows, accounts] = await Promise.all([
      this.prisma.$queryRawUnsafe<UrlRow[]>(URLS_SQL),
      this.prisma.account.findMany({
        select: { id: true, nomeAgencia: true, plan: true },
      }),
    ]);

    // key -> dono. A primeira referencia vence (uma key quase nunca e
    // compartilhada; quando e - ex.: foto do portfolio reaproveitando o
    // arquivo do video - a conta e a mesma).
    const existing = new Set(objects.map((o) => o.key));
    const owner = new Map<
      string,
      { accountId: string; categoria: StorageCategoria }
    >();
    for (const r of rows) {
      const key = this.resolveKey(r.url, existing);
      if (key && !owner.has(key))
        owner.set(key, { accountId: r.account_id, categoria: r.categoria });
    }

    const accountInfo = new Map(accounts.map((a) => [a.id, a]));
    const perAccount = new Map<
      string,
      Bucket & { porCategoria: Partial<Record<StorageCategoria, number>> }
    >();
    const perCategoria = new Map<StorageCategoria, Bucket>();
    const orphanByFolder = new Map<string, Bucket>();
    let totalBytes = 0;
    let orphanBytes = 0;
    let orphanFiles = 0;

    for (const o of objects) {
      totalBytes += o.size;
      const ref = owner.get(o.key);
      if (!ref) {
        orphanBytes += o.size;
        orphanFiles += 1;
        const pasta = o.key.includes('/') ? o.key.split('/')[0] : '(raiz)';
        const b = orphanByFolder.get(pasta) ?? { bytes: 0, arquivos: 0 };
        b.bytes += o.size;
        b.arquivos += 1;
        orphanByFolder.set(pasta, b);
        continue;
      }
      const acc = perAccount.get(ref.accountId) ?? {
        bytes: 0,
        arquivos: 0,
        porCategoria: {},
      };
      acc.bytes += o.size;
      acc.arquivos += 1;
      acc.porCategoria[ref.categoria] =
        (acc.porCategoria[ref.categoria] ?? 0) + o.size;
      perAccount.set(ref.accountId, acc);

      const cat = perCategoria.get(ref.categoria) ?? { bytes: 0, arquivos: 0 };
      cat.bytes += o.size;
      cat.arquivos += 1;
      perCategoria.set(ref.categoria, cat);
    }

    const billableGb = Math.max(0, totalBytes / GB - R2_FREE_GB);

    return {
      disponivel: true,
      erro: null,
      atualizadoEm: now,
      totalBytes,
      totalArquivos: objects.length,
      custoEstimadoUsdMes:
        Math.round(billableGb * R2_USD_PER_GB_MONTH * 100) / 100,
      porCategoria: [...perCategoria.entries()]
        .map(([categoria, b]) => ({
          categoria,
          label: STORAGE_CATEGORIA_LABEL[categoria],
          ...b,
        }))
        .sort((a, b) => b.bytes - a.bytes),
      porConta: [...perAccount.entries()]
        .map(([accountId, b]) => ({
          accountId,
          nomeAgencia:
            accountInfo.get(accountId)?.nomeAgencia ?? '(conta removida)',
          plano: accountInfo.get(accountId)?.plan ?? 'free',
          ...b,
        }))
        .sort((a, b) => b.bytes - a.bytes),
      naoVinculados: {
        bytes: orphanBytes,
        arquivos: orphanFiles,
        porPasta: [...orphanByFolder.entries()]
          .map(([pasta, b]) => ({ pasta, ...b }))
          .sort((a, b) => b.bytes - a.bytes),
      },
    };
  }
}

/**
 * Todas as colunas do schema que apontam para um objeto do R2, com a conta
 * dona. Ao criar uma coluna nova de arquivo, adicione-a aqui - senao o
 * arquivo aparece como "nao vinculado" no painel.
 */
const URLS_SQL = `
SELECT p.account_id, v.url_storage AS url, 'videos' AS categoria
  FROM videos v JOIN projects p ON p.id = v.project_id
UNION ALL SELECT p.account_id, v.url_otimizada, 'videos_otimizados'
  FROM videos v JOIN projects p ON p.id = v.project_id WHERE v.url_otimizada IS NOT NULL
UNION ALL SELECT p.account_id, v.thumbnail_url, 'miniaturas'
  FROM videos v JOIN projects p ON p.id = v.project_id WHERE v.thumbnail_url IS NOT NULL
UNION ALL SELECT p.account_id, c.audio_url, 'audios'
  FROM comments c JOIN videos v ON v.id = c.video_id JOIN projects p ON p.id = v.project_id
  WHERE c.audio_url IS NOT NULL
UNION ALL SELECT pf.account_id, pv.url_storage, 'portfolio'
  FROM portfolio_videos pv JOIN portfolios pf ON pf.id = pv.portfolio_id WHERE pv.url_storage IS NOT NULL
UNION ALL SELECT pf.account_id, pv.url_otimizada, 'portfolio'
  FROM portfolio_videos pv JOIN portfolios pf ON pf.id = pv.portfolio_id WHERE pv.url_otimizada IS NOT NULL
UNION ALL SELECT pf.account_id, pv.poster_url, 'portfolio'
  FROM portfolio_videos pv JOIN portfolios pf ON pf.id = pv.portfolio_id WHERE pv.poster_url IS NOT NULL
UNION ALL SELECT account_id, capa_url, 'portfolio' FROM portfolios WHERE capa_url IS NOT NULL
UNION ALL SELECT account_id, capa_url, 'portfolio' FROM portfolio_categories WHERE capa_url IS NOT NULL
UNION ALL SELECT account_id, foto_url, 'portfolio' FROM portfolio_profiles WHERE foto_url IS NOT NULL
UNION ALL SELECT account_id, capa_url, 'portfolio' FROM portfolio_profiles WHERE capa_url IS NOT NULL
UNION ALL SELECT account_id, url_storage, 'arquivos_clientes' FROM client_files
UNION ALL SELECT d.account_id, a.url_storage, 'anexos_kanban'
  FROM demanda_anexos a JOIN demandas d ON d.id = a.demanda_id
UNION ALL SELECT account_id, image_url, 'checkday' FROM checkday_notes WHERE image_url IS NOT NULL
UNION ALL SELECT account_id, foto_url, 'marca_fotos' FROM projects WHERE foto_url IS NOT NULL
UNION ALL SELECT account_id, foto_url, 'marca_fotos' FROM clients WHERE foto_url IS NOT NULL
UNION ALL SELECT account_id, logo_url, 'marca_fotos' FROM clients WHERE logo_url IS NOT NULL
UNION ALL SELECT m.account_id, u.logo_url, 'marca_fotos'
  FROM users u JOIN memberships m ON m.user_id = u.id WHERE u.logo_url IS NOT NULL
UNION ALL SELECT m.account_id, u.avatar_url, 'marca_fotos'
  FROM users u JOIN memberships m ON m.user_id = u.id WHERE u.avatar_url IS NOT NULL
`;
