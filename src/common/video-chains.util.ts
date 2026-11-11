/**
 * Agrupa versoes de video em cadeias (video raiz + novas versoes ligadas por
 * video_pai_id). Cada cadeia vem ordenada da versao mais antiga para a mais
 * recente: o primeiro item e o envio original, o ultimo e a versao atual.
 *
 * Usado pelos indicadores que tratam a cadeia como UMA entrega (desempenho da
 * equipe, relatorio de produtividade). Ciclos ou pais fora da lista sao
 * tolerados: a cadeia para no ultimo pai conhecido.
 */
export function agruparCadeias<
  T extends { id: string; videoPaiId: string | null; criadoEm: Date },
>(videos: T[]): T[][] {
  const porId = new Map(videos.map((v) => [v.id, v]));
  const raizCache = new Map<string, string>();

  const raizDe = (id: string): string => {
    const cached = raizCache.get(id);
    if (cached) return cached;
    const visitados = new Set<string>();
    let atual = porId.get(id)!;
    while (
      atual.videoPaiId &&
      porId.has(atual.videoPaiId) &&
      !visitados.has(atual.videoPaiId)
    ) {
      visitados.add(atual.id);
      atual = porId.get(atual.videoPaiId)!;
    }
    raizCache.set(id, atual.id);
    return atual.id;
  };

  const grupos = new Map<string, T[]>();
  for (const v of videos) {
    const raiz = raizDe(v.id);
    const g = grupos.get(raiz) ?? [];
    g.push(v);
    grupos.set(raiz, g);
  }
  return [...grupos.values()].map((g) =>
    g.sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime()),
  );
}

/** O prazo e gravado como meia-noite do dia; vale ate o fim desse dia. */
export const DIA_MS = 24 * 60 * 60 * 1000;

export function fimDoPrazo(prazo: Date): number {
  return prazo.getTime() + DIA_MS;
}
