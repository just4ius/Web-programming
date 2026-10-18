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

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
};
