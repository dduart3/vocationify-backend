import { Request, Response } from 'express';
import { SessionService } from '../services/SessionService';
import { QuestionService } from '../services/QuestionService';
import { ApiResponse, CreateSessionRequest, CreateSessionResponse, GetSessionResponse } from '../types/api';
import { asyncHandler } from '../middleware/errorHandler';

export class SessionController {
  private sessionService = new SessionService();
  private questionService = new QuestionService();

  createSession = asyncHandler(async (req: Request<{}, ApiResponse<CreateSessionResponse>, CreateSessionRequest>, res: Response<ApiResponse<CreateSessionResponse>>) => {
    const { user_id } = req.body;

    const sessionId = await this.sessionService.createSession(user_id);
    const firstQuestion = await this.questionService.getNextQuestion(sessionId);

    if (!firstQuestion) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate first question'
      });
    }

    res.status(201).json({
      success: true,
      data: {
        id: sessionId,
        question: firstQuestion,
        progress: 0
      }
    });
  });

  getSession = asyncHandler(async (req: Request, res: Response<ApiResponse<GetSessionResponse>>) => {
    const sessionId = req.query.session_id as string;

    const context = await this.sessionService.getSession(sessionId);
    
    if (!context) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const progress = Math.min((context.question_count / 15) * 100, 100);

    res.json({
      success: true,
      data: {
        id: context.session_id,
        question_count: context.question_count,
        current_scores: context.current_riasec_scores,
        progress,
        can_complete: context.test_state.can_complete,
        estimated_remaining: context.test_state.estimated_remaining_questions
      }
    });
  });

  completeSession = asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { session_id } = req.body;

    const context = await this.sessionService.getSession(session_id);
    
    if (!context) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    if (!context.test_state.can_complete) {
      return res.status(400).json({
        success: false,
        error: 'Session cannot be completed yet. More questions needed.'
      });
    }

    await this.sessionService.completeSession(session_id);

    res.json({
      success: true,
      message: 'Session completed successfully'
    });
  });
}
