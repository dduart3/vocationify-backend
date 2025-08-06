import { Router } from 'express';
import { ConversationController } from '../controllers/conversationController';
import { validate } from '../middleware/validation';
import { z } from 'zod';

const router = Router();
const conversationController = new ConversationController();

// Validation schemas
const createSessionSchema = z.object({
  body: z.object({
    user_id: z.string().uuid().optional()
  })
});

const sendMessageSchema = z.object({
  body: z.object({
    session_id: z.string().uuid(),
    message: z.string().min(1).max(1000)
  })
});

const sessionParamsSchema = z.object({
  params: z.object({
    sessionId: z.string().uuid()
  })
});

// Routes
router.post('/conversations', 
  validate(createSessionSchema), 
  conversationController.createConversationalSession
);

router.post('/conversations/message', 
  validate(sendMessageSchema), 
  conversationController.sendMessage
);

router.get('/conversations/:sessionId/results', 
  validate(sessionParamsSchema), 
  conversationController.getSessionResults
);

router.get('/conversations/:sessionId/history', 
  validate(sessionParamsSchema), 
  conversationController.getConversationHistory
);

export default router;