import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ApiResponse } from '../types/api';

// Zod schemas
const riasecTypeSchema = z.enum(['realistic', 'investigative', 'artistic', 'social', 'enterprising', 'conventional']);

export const createSessionSchema = z.object({
  body: z.object({
    user_id: z.uuid().optional()
  })
});

export const submitResponseSchema = z.object({
  body: z.object({
    session_id: z.uuid(),
    question_id: z.string().min(1),
    question_text: z.string().min(1),
    question_category: riasecTypeSchema,
    response_value: z.number().int().min(1).max(5),
    response_time: z.number().int().min(0)
  })
});

export const sessionIdParamSchema = z.object({
  params: z.object({
    sessionId: z.uuid()
  })
});

export const getSessionSchema = z.object({
  query: z.object({
    session_id: z.uuid()
  })
});

export const completeSessionSchema = z.object({
  body: z.object({
    session_id: z.uuid()
  })
});

// Generic validation middleware factory
export const validate = (schema: z.ZodSchema) => {
  return (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params
      });
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.issues.map(err => 
          `${err.path.join('.')}: ${err.message}`
        );
        
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          message: errorMessages.join(', ')
        });
      }
      
      return res.status(500).json({
        success: false,
        error: 'Internal validation error'
      });
    }
  };
};

// Specific validation middlewares
export const validateCreateSession = validate(createSessionSchema);
export const validateSubmitResponse = validate(submitResponseSchema);
export const validateSessionId = validate(sessionIdParamSchema);
export const validateGetSession = validate(getSessionSchema);
export const validateCompleteSession = validate(completeSessionSchema);
