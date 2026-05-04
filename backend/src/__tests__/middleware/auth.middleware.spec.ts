import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../utils/database';

jest.mock('jsonwebtoken');
jest.mock('../../utils/database');

describe('Auth Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('authenticate', () => {
    it('should attach user to request with valid token', async () => {
      const token = 'valid-token';
      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      const decodedUser = {
        userId: 'user-1',
        email: 'user@example.com',
        role: 'ADMIN',
      };

      (jwt.verify as jest.Mock).mockReturnValue(decodedUser);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        role: 'ADMIN',
        active: true,
      });

      await authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.user).toEqual(decodedUser);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject request without Authorization header', async () => {
      mockRequest.headers = {};

      await authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should reject request with invalid Bearer format', async () => {
      mockRequest.headers = {
        authorization: 'InvalidToken',
      };

      await authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should reject expired token', async () => {
      const token = 'expired-token';
      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      const error = new Error('jwt expired');
      (error as any).name = 'JsonWebTokenError';
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw error;
      });

      await authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should reject request for inactive user', async () => {
      const token = 'valid-token';
      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      const decodedUser = {
        userId: 'user-1',
        email: 'user@example.com',
        role: 'VIEWER',
      };

      (jwt.verify as jest.Mock).mockReturnValue(decodedUser);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        role: 'VIEWER',
        active: false, // Inactive user
      });

      await authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should reject request for non-existent user', async () => {
      const token = 'valid-token';
      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      const decodedUser = {
        userId: 'user-999',
        email: 'nonexistent@example.com',
        role: 'VIEWER',
      };

      (jwt.verify as jest.Mock).mockReturnValue(decodedUser);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('authorize', () => {
    it('should allow ADMIN user to access ADMIN-only route', () => {
      mockRequest.user = {
        userId: 'user-1',
        email: 'admin@example.com',
        role: 'ADMIN',
      };

      const middleware = authorize('ADMIN');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow VIEWER user to access VIEWER route', () => {
      mockRequest.user = {
        userId: 'user-1',
        email: 'viewer@example.com',
        role: 'VIEWER',
      };

      const middleware = authorize('VIEWER', 'ADMIN');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny VIEWER user access to ADMIN-only route', () => {
      mockRequest.user = {
        userId: 'user-1',
        email: 'viewer@example.com',
        role: 'VIEWER',
      };

      const middleware = authorize('ADMIN');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should deny access if user is not authenticated', () => {
      mockRequest.user = undefined;

      const middleware = authorize('ADMIN');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should allow multiple roles', () => {
      mockRequest.user = {
        userId: 'user-1',
        email: 'user@example.com',
        role: 'VIEWER',
      };

      const middleware = authorize('ADMIN', 'VIEWER');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
