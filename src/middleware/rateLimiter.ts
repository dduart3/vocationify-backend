import rateLimit from 'express-rate-limit';
import { config } from '../config/environment';

export const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: {
    success: false,
    error: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const strictLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 requests per 5 minutes
  message: {
    success: false,
    error: 'Too many requests for this endpoint, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const sessionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute per session
  keyGenerator: (req) => {
    return req.body.session_id || req.params.sessionId || req.ip;
  },
  message: {
    success: false,
    error: 'Too many requests for this session, please slow down'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
