-- Backfill: portfolios criados antes do link virar slug (ver
-- createWithUniqueSlugLinkPublico em src/common/short-id.util.ts) ainda
-- tem link_publico em UUID puro. Troca por um slug derivado do nome,
-- mesma ideia do gerador em TS (minusculo, sem acento/pontuacao, ate 40
-- chars, sufixo curto em colisao) - so nao usa NFD/unaccent (extensao pode
-- nao estar disponivel neste Postgres gerenciado), troca os acentos mais
-- comuns em PT-BR via translate() puro.
DO $$
DECLARE
  r RECORD;
  base_slug TEXT;
  candidate TEXT;
  attempt INT;
BEGIN
  FOR r IN
    SELECT id, nome FROM portfolios
    WHERE link_publico ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  LOOP
    base_slug := translate(
      lower(r.nome),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'
    );
    base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
    base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
    base_slug := left(base_slug, 40);
    base_slug := regexp_replace(base_slug, '-+$', '', 'g');
    IF base_slug = '' THEN
      base_slug := 'portfolio';
    END IF;

    candidate := base_slug;
    attempt := 0;
    WHILE EXISTS (SELECT 1 FROM portfolios WHERE link_publico = candidate AND id <> r.id) LOOP
      attempt := attempt + 1;
      candidate := base_slug || '-' || substr(md5(random()::text), 1, 4);
      EXIT WHEN attempt > 5;
    END LOOP;

    UPDATE portfolios SET link_publico = candidate WHERE id = r.id;
  END LOOP;
END $$;
