class AppError extends Error {
  constructor(message, { statusCode = 500, error = 'InternalServerError', code = 'INTERNAL_SERVER_ERROR', details = [] } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.error = error;
    this.code = code;
    this.details = details;
  }
}

class ValidationError extends AppError {
  constructor(message, { code = 'VALIDATION_ERROR', field = null, details = [] } = {}) {
    const errorDetails = details.length > 0
      ? details
      : [{ field: field || 'unknown', message }];

    super(message, {
      statusCode: 400,
      error: 'ValidationError',
      code,
      details: errorDetails,
    });
  }
}

class NotFoundError extends AppError {
  constructor(message, { code = 'NOT_FOUND', details = [] } = {}) {
    const errorDetails = details.length > 0
      ? details
      : [{ message }];

    super(message, {
      statusCode: 404,
      error: 'NotFoundError',
      code,
      details: errorDetails,
    });
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', { code = 'UNAUTHORIZED' } = {}) {
    super(message, { statusCode: 401, error: 'UnauthorizedError', code, details: [{ message }] });
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Not enough permissions', { code = 'FORBIDDEN' } = {}) {
    super(message, { statusCode: 403, error: 'ForbiddenError', code, details: [{ message }] });
  }
}

class ConflictError extends AppError {
  constructor(message, { code = 'CONFLICT', field = null } = {}) {
    super(message, { statusCode: 409, error: 'ConflictError', code, details: [{ field: field || 'unknown', message }] });
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
};
