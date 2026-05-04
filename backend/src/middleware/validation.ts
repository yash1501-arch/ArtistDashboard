import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export const validateRequest = (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Zod errors are already thrown in route handlers
    return next();
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        })),
      });
    }
    return next(error);
  }
};
