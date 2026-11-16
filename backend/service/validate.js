// Спільні перевірки вхідних даних для сервісів
const { ValidationError, ForbiddenError } = require('./errors');
const { can } = require('../domain/Member');

function text(value, field, { min = 1, max = 255, code = 'INVALID_FIELD', optional = false } = {}) {
  if (value === undefined || value === null) {
    if (optional) return undefined;
    throw new ValidationError(`Field "${field}" is required`, { code, field });
  }
  if (typeof value !== 'string') {
    throw new ValidationError(`Field "${field}" must be a string`, { code, field });
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new ValidationError(`Field "${field}" must be ${min}–${max} characters long`, { code, field });
  }
  return trimmed;
}

// Позитивне ціле число (id) або null, якщо дозволено
function id(value, field, { nullable = false } = {}) {
  if (value === null && nullable) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ValidationError(`Field "${field}" must be a positive integer`, { code: 'INVALID_ID', field });
  }
  return n;
}

function email(value) {
  const v = text(value, 'email', { min: 3, max: 255, code: 'INVALID_EMAIL' }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    throw new ValidationError('Email has invalid format', { code: 'INVALID_EMAIL', field: 'email' });
  }
  return v;
}

function password(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 72) {
    throw new ValidationError('Password must be 8–72 characters long', { code: 'WEAK_PASSWORD', field: 'password' });
  }
  return value;
}

function body(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('Request body must be a JSON object', { code: 'INVALID_PAYLOAD' });
  }
  return value;
}

// Перевірка ролі: кидає 403, якщо в користувача недостатньо прав
function requirePermission(actor, permission) {
  if (!can(actor.role, permission)) {
    throw new ForbiddenError(`Role "${actor.role}" cannot perform "${permission}"`, { code: 'FORBIDDEN' });
  }
}

module.exports = { text, id, email, password, body, requirePermission };
