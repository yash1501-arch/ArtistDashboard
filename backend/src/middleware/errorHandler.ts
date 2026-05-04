import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  status?: string;
  errors?: any;
}

export const errorHandler = (
  err: ApiError,
  _req: Request,
  _res: Response,
  _next: NextFunction
) => {
  console.error('Error:', err);

  // Use _res to reply (it's typed as Response despite the underscore)
  const res = _res;

  const isProduction = process.env.NODE_ENV === 'production';

  // Prisma validation errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return res.status(400).json({
      success: false,
      message: 'Database operation failed',
      code: 'DATABASE_ERROR',
      details: isProduction ? undefined : err.message,
    });
  }

  // Prisma validation errors (like unique constraint)
  if (err instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({
      success: false,
      message: 'Invalid data provided',
      code: 'VALIDATION_ERROR',
      details: isProduction ? undefined : err.message,
    });
  }

  // Zod validation errors
  if (err.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.errors,
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
      code: 'INVALID_TOKEN',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired',
      code: 'TOKEN_EXPIRED',
    });
  }

  // Custom API errors with statusCode
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code || 'ERROR',
    });
  }

  // Default server error
  return res.status(500).json({
    success: false,
    message: isProduction ? 'Internal server error' : err.message,
    code: 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

export default errorHandler;
