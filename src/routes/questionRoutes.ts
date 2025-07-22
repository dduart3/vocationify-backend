import { Router } from 'express';
import { QuestionController } from '../controllers/questionController';
import { validateSessionId, validateSubmitResponse } from '../middleware/validation';
import { sessionLimiter } from '../middleware/rateLimiter';

const router = Router();
const questionController = new QuestionController();

// GET /api/questions/:sessionId/next - Get next question for session
router.get(
  '/:sessionId/next',
  validateSessionId,
  questionController.getNextQuestion
);

// POST /api/questions/response - Submit question response
router.post(
  '/response',
  sessionLimiter,
  validateSubmitResponse,
  questionController.submitResponse
);

export { router as questionRoutes };
