import { Router } from 'express';
import { concertController } from '../controllers/concert.controller';
import { authenticate, isAdmin } from '../middleware/auth';

const router = Router();

/**
 * @route GET /api/v1/concerts
 * @desc List concerts with pagination and filters
 * @access Public
 */
router.get('/', concertController.list);

/**
 * @route GET /api/v1/concerts/:id
 * @desc Get single concert by ID
 * @access Public
 */
router.get('/:id', concertController.getById);

/**
 * @route POST /api/v1/concerts
 * @desc Create concert (admin only)
 * @access Private (Admin)
 */
router.post(
  '/',
  authenticate,
  isAdmin,
  concertController.create
);

/**
 * @route PUT /api/v1/concerts/:id
 * @desc Update concert (admin only)
 * @access Private (Admin)
 */
router.put(
  '/:id',
  authenticate,
  isAdmin,
  concertController.update
);

/**
 * @route GET /api/v1/concerts/cities
 * @desc Get cities with aggregated statistics
 * @access Public
 */
router.get('/cities', concertController.getCities);

/**
 * @route GET /api/v1/concerts/venues
 * @desc Get venues with aggregated statistics
 * @access Public
 */
router.get('/venues', concertController.getVenues);

export default router;
