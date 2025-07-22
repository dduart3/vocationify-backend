import { Router } from 'express';
import { sessionRoutes } from './sessionRoutes';
import { questionRoutes } from './questionRoutes';
import { resultRoutes } from './resultRoutes';

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
router.use('/sessions', sessionRoutes);
router.use('/questions', questionRoutes);
router.use('/results', resultRoutes);

export { router as apiRoutes };
