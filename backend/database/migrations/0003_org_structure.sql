-- 0003. Організаційна структура компанії: відділи та посади

CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES departments(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL CHECK (char_length(btrim(name)) >= 2),
  description TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX IF NOT EXISTS departments_workspace_idx ON departments (workspace_id, parent_id);

CREATE TABLE IF NOT EXISTS positions (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  title VARCHAR(150) NOT NULL CHECK (char_length(btrim(title)) >= 2),
  responsibilities TEXT NOT NULL DEFAULT '',
  headcount INTEGER NOT NULL DEFAULT 1 CHECK (headcount BETWEEN 1 AND 1000),
  -- Посилання на сторінку з посадовою інструкцією (якщо сторінку видалять — посилання обнулиться)
  instruction_page_id INTEGER REFERENCES pages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS positions_department_idx ON positions (department_id);
