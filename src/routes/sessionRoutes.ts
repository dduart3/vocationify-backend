import { Router } from 'express';
import { SessionController } from '../controllers/sessionController';
import { validateCreateSession, validateGetSession, validateCompleteSession } from '../middleware/validation';
import { sessionLimiter } from '../middleware/rateLimiter';

const router = Router();
const sessionController = new SessionController();

// POST /api/sessions - Create new test session
router.post(
  '/',
  sessionLimiter,
  validateCreateSession,
  sessionController.createSession
);

// GET /api/sessions - Get session details
router.get(
  '/',
  validateGetSession,
  sessionController.getSession
);

// POST /api/sessions/complete - Complete test session
router.post(
  '/complete',
  sessionLimiter,
  validateCompleteSession,
  sessionController.completeSession
);

export { router as sessionRoutes };
