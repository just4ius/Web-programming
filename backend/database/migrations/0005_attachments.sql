-- 0005. Файли-документи, прикріплені до сторінок (статут, накази, скани)
-- Файли зберігаються прямо в PostgreSQL (BYTEA): одна база, один бекап,
-- без окремого файлового сховища. Обмеження розміру (10 МБ) перевіряє і API, і база.

CREATE TABLE IF NOT EXISTS attachments (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL CHECK (char_length(btrim(file_name)) > 0),
  mime_type VARCHAR(150) NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  data BYTEA NOT NULL,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attachments_page_idx ON attachments (page_id);
