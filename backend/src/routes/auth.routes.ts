import { Router } from 'express';
import {
  login,
  refresh,
  logout,
  me,
} from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * @route POST /api/v1/auth/login
 * @desc Authenticate user and get JWT
 * @access Public
 */
router.post(
  '/login',
  login
);

/**
 * @route POST /api/v1/auth/refresh
 * @desc Refresh access token using refresh token cookie
 * @access Public
 */
router.post(
  '/refresh',
  refresh
);

/**
 * @route POST /api/v1/auth/logout
 * @desc Logout and clear refresh token
 * @access Private (requires auth)
 */
router.post(
  '/logout',
  authenticate,
  logout
);

/**
 * @route GET /api/v1/auth/me
 * @desc Get current user info
 * @access Private (requires auth)
 */
router.get(
  '/me',
  authenticate,
  me
);

export default router;
