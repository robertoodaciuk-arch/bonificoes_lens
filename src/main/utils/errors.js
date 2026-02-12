class AppError extends Error {
  constructor(message, code = 'APP_ERROR', statusCode = 500, details) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }
}

class ValidationError extends AppError {
  constructor(message, details) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

module.exports = {
  AppError,
  ValidationError,
};
