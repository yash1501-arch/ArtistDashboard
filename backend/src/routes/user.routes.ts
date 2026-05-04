import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { authenticate, isAdmin } from '../middleware/auth';

const router = Router();

// All user management routes require admin privileges
router.use(authenticate, isAdmin);

/**
 * @route GET /api/v1/users
 * @desc Get all users
 * @access Admin only
 */
router.get('/', userController.getAllUsers);

/**
 * @route POST /api/v1/users
 * @desc Create a new user
 * @access Admin only
 */
router.post('/', userController.createUser);

/**
 * @route PATCH /api/v1/users/:id
 * @desc Update user details
 * @access Admin only
 */
router.patch('/:id', userController.updateUser);

/**
 * @route DELETE /api/v1/users/:id
 * @desc Delete a user
 * @access Admin only
 */
router.delete('/:id', userController.deleteUser);

export default router;
