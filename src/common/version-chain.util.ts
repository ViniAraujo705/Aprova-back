import { PrismaService } from '../prisma/prisma.service';

// Mesmo teto de PublicService.MAX_VERSION_DEPTH: ciclo em video_pai_id e
// impossivel pela aplicacao, mas o banco nao impede - sem limite o CTE
// recursivo nao terminaria.
const MAX_VERSION_DEPTH = 50;

/**
 * Ids de todas as versoes ANTERIORES de um video (pai, avo, ...), subindo
 * por video_pai_id numa unica query. Nao inclui o proprio video. Vazio
 * quando ele e a v1.
 *
 * Cada nova versao e um registro novo em `videos`, e os comentarios ficam
 * presos a versao em que foram feitos - nada e apagado ao subir versao. Isso
 * e o que permite mostrar os ajustes pedidos nas versoes anteriores.
 */
export async function previousVersionIds(
  prisma: PrismaService,
  videoId: string,
): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE ancestors AS (
      SELECT v.video_pai_id AS id, 1 AS depth
      FROM videos v
      WHERE v.id = ${videoId} AND v.video_pai_id IS NOT NULL
      UNION ALL
      SELECT p.video_pai_id, a.depth + 1
      FROM videos p
      JOIN ancestors a ON p.id = a.id
      WHERE p.video_pai_id IS NOT NULL AND a.depth < ${MAX_VERSION_DEPTH}
    )
    SELECT id FROM ancestors
  `;
  return rows.map((row) => row.id);
}
