import { Request, Response } from 'express';
import { userController } from '../../controllers/user.controller';
import { prisma } from '../../utils/database';
import bcrypt from 'bcryptjs';

jest.mock('bcryptjs');
jest.mock('../../utils/database');

describe('User Controller', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    mockRequest = {};
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  describe('getAllUsers', () => {
    it('should return all users', async () => {
      const mockUsers = [
        { id: 'user-1', email: 'user1@example.com', role: 'VIEWER', active: true, created_at: new Date() },
        { id: 'user-2', email: 'user2@example.com', role: 'ADMIN', active: true, created_at: new Date() },
      ];

      (prisma.user.findMany as jest.Mock).mockResolvedValue(mockUsers);

      await userController.getAllUsers(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: { users: mockUsers },
      });
    });

    it('should handle database errors', async () => {
      (prisma.user.findMany as jest.Mock).mockRejectedValue(new Error('DB Error'));

      await expect(
        userController.getAllUsers(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow('DB Error');
    });
  });

  describe('createUser', () => {
    it('should create a new user with valid input', async () => {
      mockRequest.body = {
        email: 'newuser@example.com',
        password: 'password123',
        role: 'VIEWER',
      };

      const mockNewUser = {
        id: 'user-3',
        email: 'newuser@example.com',
        passwordHash: 'hashed-password',
        role: 'VIEWER',
        active: true,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      (prisma.user.create as jest.Mock).mockResolvedValue(mockNewUser);

      await userController.createUser(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'User created successfully',
        })
      );
    });

    it('should reject duplicate email', async () => {
      mockRequest.body = {
        email: 'existing@example.com',
        password: 'password123',
        role: 'VIEWER',
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1' });

      await userController.createUser(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'User already exists',
        })
      );
    });

    it('should require email and password', async () => {
      mockRequest.body = { role: 'VIEWER' };

      await userController.createUser(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Email and password are required',
        })
      );
    });

    it('should default to VIEWER role', async () => {
      mockRequest.body = {
        email: 'newuser@example.com',
        password: 'password123',
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      (prisma.user.create as jest.Mock).mockResolvedValue({
        id: 'user-3',
        role: 'VIEWER',
      });

      await userController.createUser(mockRequest as Request, mockResponse as Response);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'VIEWER',
          }),
        })
      );
    });
  });

  describe('updateUser', () => {
    it('should update a user with valid data', async () => {
      mockRequest.params = { id: 'user-1' };
      mockRequest.body = {
        email: 'updated@example.com',
        role: 'ADMIN',
        active: true,
      };

      const mockUpdatedUser = {
        id: 'user-1',
        email: 'updated@example.com',
        role: 'ADMIN',
        active: true,
      };

      (prisma.user.update as jest.Mock).mockResolvedValue(mockUpdatedUser);

      await userController.updateUser(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'User updated successfully',
        })
      );
    });

    it('should hash password when updating', async () => {
      mockRequest.params = { id: 'user-1' };
      mockRequest.body = {
        password: 'newpassword123',
      };

      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      await userController.updateUser(mockRequest as Request, mockResponse as Response);

      expect(bcrypt.hash).toHaveBeenCalledWith('newpassword123', 10);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passwordHash: 'new-hashed-password',
          }),
        })
      );
    });
  });

  describe('deleteUser', () => {
    it('should delete a user', async () => {
      mockRequest.params = { id: 'user-1' };

      (prisma.user.delete as jest.Mock).mockResolvedValue({ id: 'user-1' });

      await userController.deleteUser(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'User deleted successfully',
        })
      );
    });

    it('should handle user not found', async () => {
      mockRequest.params = { id: 'nonexistent' };

      (prisma.user.delete as jest.Mock).mockRejectedValue(new Error('User not found'));

      await expect(
        userController.deleteUser(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow('User not found');
    });
  });
});
