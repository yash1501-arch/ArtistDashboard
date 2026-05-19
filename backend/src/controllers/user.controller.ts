import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/database';

export const userController = {
  // Get all users (admin only)
  getAllUsers: async (_req: any, res: Response) => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          role: true,
          active: true,
          created_at: true,
        },
        orderBy: { created_at: 'desc' },
      });

      return res.status(200).json({
        success: true,
        data: { users },
      });
    } catch (error) {
      throw error;
    }
  },

  // Create a new user (admin only)
  createUser: async (req: any, res: Response) => {
    try {
      const { email, password, role } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required',
        });
      }

      // Check if user exists
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'User already exists',
        });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          role: role || 'VIEWER',
          active: true,
        },
      });

      return res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: {
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
            active: user.active,
          },
        },
      });
    } catch (error) {
      throw error;
    }
  },

  // Update user (admin only)
  updateUser: async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const { email, role, active, password } = req.body;

      const data: any = {};
      if (email) data.email = email;
      if (role) data.role = role;
      if (active !== undefined) data.active = active;
      if (password) {
        data.passwordHash = await bcrypt.hash(password, 10);
      }

      const user = await prisma.user.update({
        where: { id },
        data,
      });

      return res.status(200).json({
        success: true,
        message: 'User updated successfully',
        data: {
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
            active: user.active,
          },
        },
      });
    } catch (error) {
      throw error;
    }
  },

  // Delete user (admin only)
  deleteUser: async (req: any, res: Response) => {
    try {
      const { id } = req.params;

      // Prevent deleting the last admin if necessary, or self-deletion
      if (req.user?.userId === id) {
        return res.status(400).json({
          success: false,
          message: 'You cannot delete your own account',
        });
      }

      await prisma.user.delete({ where: { id } });

      return res.status(200).json({
        success: true,
        message: 'User deleted successfully',
      });
    } catch (error) {
      throw error;
    }
  },
};
