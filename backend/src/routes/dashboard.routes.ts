import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * @route GET /api/v1/dashboard/kpis
 * @desc Get all dashboard KPI values
 * @access Public (authenticated)
 */
router.get('/kpis', authenticate, dashboardController.getKPIs);

/**
 * @route GET /api/v1/dashboard/top-artists
 * @desc Get top performing artists by followers
 * @access Public (authenticated)
 */
router.get('/top-artists', authenticate, dashboardController.getTopArtists);

export default router;
