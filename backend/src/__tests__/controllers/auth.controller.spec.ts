import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { login } from '../../controllers/auth.controller';
import { prisma } from '../../utils/database';

jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('../../utils/database');

describe('Auth Controller - Login', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    mockRequest = {
      body: {
        email: 'test@example.com',
        password: 'password123',
      },
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
    };
  });

  describe('Successful Login', () => {
    it('should login a user with valid credentials', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        role: 'VIEWER',
        active: true,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (jwt.sign as jest.Mock)
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token');
      (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});

      await login(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            accessToken: 'access-token',
          }),
        })
      );
    });
  });

  describe('Failed Login', () => {
    it('should reject login with invalid email', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await login(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'INVALID_CREDENTIALS',
        })
      );
    });

    it('should reject login with invalid password', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        role: 'VIEWER',
        active: true,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await login(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'INVALID_CREDENTIALS',
        })
      );
    });

    it('should reject login for inactive user', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        role: 'VIEWER',
        active: false,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await login(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'INVALID_CREDENTIALS',
        })
      );
    });

    it('should handle database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      (prisma.user.findUnique as jest.Mock).mockRejectedValue(dbError);

      await expect(login(mockRequest as Request, mockResponse as Response)).rejects.toThrow(
        'Database connection failed'
      );
    });
  });

  describe('Validation', () => {
    it('should reject login with missing email', async () => {
      mockRequest.body = { password: 'password123' };

      await expect(login(mockRequest as Request, mockResponse as Response)).rejects.toThrow();
    });

    it('should reject login with missing password', async () => {
      mockRequest.body = { email: 'test@example.com' };

      await expect(login(mockRequest as Request, mockResponse as Response)).rejects.toThrow();
    });

    it('should reject login with invalid email format', async () => {
      mockRequest.body = { email: 'not-an-email', password: 'password123' };

      await expect(login(mockRequest as Request, mockResponse as Response)).rejects.toThrow();
    });
  });

  describe('Token Generation', () => {
    it('should set refresh token in HTTP-only cookie', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        role: 'VIEWER',
        active: true,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (jwt.sign as jest.Mock)
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token');
      (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});

      await login(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'refresh-token',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'strict',
        })
      );
    });

    it('should include user role in access token', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        role: 'ADMIN',
        active: true,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (jwt.sign as jest.Mock)
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token');
      (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});

      await login(mockRequest as Request, mockResponse as Response);

      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'ADMIN',
        }),
        expect.any(String),
        expect.any(Object)
      );
    });
  });
});
