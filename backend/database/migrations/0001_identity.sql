-- 0001. Компанії (робочі простори) та користувачі
-- Таблиці з попередніх лаб (items, users) створюються через IF NOT EXISTS,
-- тому міграція працює і на чистій базі, і на базі після лаб 1–6.

CREATE TABLE IF NOT EXISTS items (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL
);

-- Робочий простір = одна компанія з власною базою знань
CREATE TABLE IF NOT EXISTS workspaces (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL CHECK (char_length(btrim(name)) >= 2),
  slug VARCHAR(60) NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL
);

-- Нові поля для автентифікації (пароль зберігається лише як bcrypt-хеш)
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Email зберігаємо в нижньому регістрі, щоб User@Mail і user@mail були одним акаунтом
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));
