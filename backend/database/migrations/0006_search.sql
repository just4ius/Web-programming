-- 0006. Індекси для пошуку по базі знань
-- pg_trgm дозволяє швидко шукати підрядок (ILIKE '%відпуст%') у назвах сторінок і тексті блоків,
-- у тому числі українською, без складних налаштувань повнотекстового пошуку.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS pages_title_trgm_idx ON pages USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS blocks_content_trgm_idx ON blocks USING GIN (content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS attachments_name_trgm_idx ON attachments USING GIN (file_name gin_trgm_ops);
