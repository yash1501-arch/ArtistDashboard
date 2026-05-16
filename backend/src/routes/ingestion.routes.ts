import { Router } from 'express';
import { ingestionController } from '../controllers/ingestion.controller';
import { authenticate, isAdmin } from '../middleware/auth';
import { upload } from '../middleware/upload';

const router = Router();

// All ingestion routes require admin privileges
router.use(authenticate, isAdmin);

/**
 * @route POST /api/v1/ingestion/excel/upload
 * @desc Upload Excel file for bulk data import
 * @access Admin only
 */
router.post('/excel/upload', upload.single('file'), ingestionController.uploadExcel);

/**
 * @route POST /api/v1/ingestion/sync/:platform
 * @desc Trigger manual sync for a specific platform (e.g., youtube, instagram)
 * @access Admin only
 */
router.post('/sync/:platform', ingestionController.syncPlatform);

/**
 * @route GET /api/v1/ingestion/jobs
 * @desc List recent ingestion jobs and status
 * @access Admin only
 */
router.get('/jobs', ingestionController.listJobs);

/**
 * @route POST /api/v1/ingestion/rog/recalculate
 * @desc Recalculate RoG for all or filtered data
 * @access Admin only
 */
router.post('/rog/recalculate', ingestionController.recalcRoG);

/**
 * @route POST /api/v1/ingestion/enrich
 * @desc Enrich all artists with social media data from external APIs
 * @access Admin only
 */
router.post('/enrich', ingestionController.enrichArtists);

/**
 * @route POST /api/v1/ingestion/enrich/:id
 * @desc Enrich a single artist with social media data
 * @access Admin only
 */
router.post('/enrich/:id', ingestionController.enrichArtist);

export default router;
