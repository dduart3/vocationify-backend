import { Router } from 'express';
import conversationRoutes from './conversations';
import ttsRoutes from './tts';
import vocationalTestRoutes from './vocationalTest';

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
router.use('/vocational-test', vocationalTestRoutes); // Clean vocational test routes

export { router as apiRoutes };
