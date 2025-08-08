import { Router } from 'express';
import conversationRoutes from './conversations';
import ttsRoutes from './tts';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Vocationify API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API routes
router.use('/conversations', conversationRoutes); // Conversational vocational test routes
router.use('/tts', ttsRoutes); // Text-to-speech routes

export { router as apiRoutes };
