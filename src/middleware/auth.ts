import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types/api';

// Simple API key authentication (optional)
export const apiKeyAuth = (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  
  // For now, we'll skip API key validation
  // In production, you might want to implement proper API key validation
  next();
};

// Session validation middleware
export const validateSession = async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const sessionId = req.body.session_id || req.params.sessionId || req.query.session_id;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    // Add session validation logic here if needed
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Session validation failed'
    });
  }
};
