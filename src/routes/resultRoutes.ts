import { Router } from 'express';
import { ResultController } from '../controllers/resultController';
import { validateSessionId } from '../middleware/validation';
import { strictLimiter } from '../middleware/rateLimiter';

const router = Router();
const resultController = new ResultController();

// GET /api/results/:sessionId - Get basic test results
router.get(
  '/:sessionId',
  strictLimiter,
  validateSessionId,
  resultController.getResults
);

// GET /api/results/:sessionId/detailed - Get detailed analysis
router.get(
  '/:sessionId/detailed',
  strictLimiter,
  validateSessionId,
  resultController.getDetailedAnalysis
);

export { router as resultRoutes };
