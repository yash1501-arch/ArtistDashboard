import { Router } from 'express';
import { analyticsController } from '../controllers/analytics.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * @route GET /api/v1/analytics/rog
 * @desc Get Rate of Growth metrics
 * @access Public (authenticated)
 */
router.get('/rog', authenticate, analyticsController.getRoG);

/**
 * @route GET /api/v1/analytics/trends
 * @desc Get time-series data for charts
 * @access Public (authenticated)
 */
router.get('/trends', authenticate, analyticsController.getTrends);

/**
 * @route GET /api/v1/analytics/demographics/age
 * @desc Get age group breakdown
 * @access Public (authenticated)
 */
router.get('/demographics/age', authenticate, analyticsController.getDemographicsAge);

/**
 * @route GET /api/v1/analytics/demographics/gender
 * @desc Get gender distribution
 * @access Public (authenticated)
 */
router.get('/demographics/gender', authenticate, analyticsController.getDemographicsGender);

/**
 * @route GET /api/v1/analytics/demographics/geo
 * @desc Get geographic distribution for map
 * @access Public (authenticated)
 */
router.get('/demographics/geo', authenticate, analyticsController.getDemographicsGeo);

/**
 * @route GET /api/v1/analytics/genres
 * @desc Get genre popularity metrics
 * @access Public (authenticated)
 */
router.get('/genres', authenticate, analyticsController.getGenres);

export default router;
