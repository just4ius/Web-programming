-- 0002. Дерево сторінок бази знань і блоки вмісту

CREATE TABLE IF NOT EXISTS pages (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL DEFAULT 'Untitled',
  icon VARCHAR(50),
  parent_id INTEGER REFERENCES pages(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE
);

-- workspace_id = NULL лише у «пісочниці» лаб 4–5 (ендпоінт /pages без входу)
ALTER TABLE pages ADD COLUMN IF NOT EXISTS workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE pages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE pages ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE pages ADD CONSTRAINT pages_title_not_blank CHECK (char_length(btrim(title)) > 0);
ALTER TABLE pages ADD CONSTRAINT pages_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id);

CREATE INDEX IF NOT EXISTS pages_workspace_parent_idx ON pages (workspace_id, parent_id, position);

CREATE TABLE IF NOT EXISTS blocks (
  id SERIAL PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL DEFAULT 'paragraph',
  content TEXT DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0
);

-- data — додаткові властивості блоку (рядки таблиці, стан чекбокса)
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE blocks ADD CONSTRAINT blocks_type_check CHECK (type IN (
  'h1', 'h2', 'h3', 'paragraph', 'bullet', 'numbered', 'todo',
  'quote', 'callout', 'code', 'divider', 'table'
));

CREATE INDEX IF NOT EXISTS blocks_page_position_idx ON blocks (page_id, position);

-- Автоматичне оновлення pages.updated_at при будь-якій зміні рядка
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pages_set_updated_at ON pages;
CREATE TRIGGER pages_set_updated_at
  BEFORE UPDATE ON pages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
