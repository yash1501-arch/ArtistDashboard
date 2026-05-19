import { Router } from 'express';
import { concertController } from '../controllers/concert.controller';
import { authenticate, isAdmin } from '../middleware/auth';

const router = Router();

/**
 * @route POST /api/v1/scraping/start
 * @desc Backwards-compatible concert scrape + validation route
 * @access Private (Admin)
 */
router.post(
  '/start',
  authenticate,
  isAdmin,
  concertController.runIntelligencePipeline
);

export default router;
