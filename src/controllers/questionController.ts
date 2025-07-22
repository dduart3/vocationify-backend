import { Request, Response } from 'express';
import { QuestionService } from '../services/QuestionService';
import { SessionService } from '../services/SessionService';
import { RiasecService } from '../services/RiasecService';
import { ApiResponse, SubmitResponseRequest, SubmitResponseResponse } from '../types/api';
import { asyncHandler } from '../middleware/errorHandler';

export class QuestionController {
  private questionService = new QuestionService();
  private sessionService = new SessionService();

  getNextQuestion = asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const sessionId = req.params.sessionId;

    const question = await this.questionService.getNextQuestion(sessionId);
    
    if (!question) {
      return res.json({
        success: true,
        data: null,
        message: 'No more questions available. Test can be completed.'
      });
    }

    res.json({
      success: true,
      data: { question }
    });
  });

  submitResponse = asyncHandler(async (req: Request<{}, ApiResponse<SubmitResponseResponse>, SubmitResponseRequest>, res: Response<ApiResponse<SubmitResponseResponse>>) => {
    const {
      session_id,
      question_id,
      question_text,
      question_category,
      response_value,
      response_time
    } = req.body;

    // Get question details to get RIASEC weights
    const question = this.questionService.getQuestionById(question_id);
    
    if (!question) {
      return res.status(400).json({
        success: false,
        error: 'Invalid question ID'
      });
    }

    // Save response
    await this.sessionService.saveResponse(
      session_id,
      question_id,
      question_text,
      question_category as any,
      response_value,
      response_time,
      question.riasec_weights
    );

    // Get updated session context
    const context = await this.sessionService.getSession(session_id);
    
    if (!context) {
      return res.status(500).json({
        success: false,
        error: 'Failed to get session context'
      });
    }

    const progress = Math.min((context.question_count / 15) * 100, 100);

    // Check if test is complete
    if (!context.test_state.should_continue) {
      await this.sessionService.completeSession(session_id);
      
      return res.json({
        success: true,
        data: {
          progress,
          can_complete: true,
          completed: true,
          final_scores: context.current_riasec_scores,
          current_scores: context.current_riasec_scores
        }
      });
    }

    // Get next question
    const nextQuestion = await this.questionService.getNextQuestion(session_id);

    res.json({
      success: true,
      data: {
        question: nextQuestion || undefined,
        current_scores: context.current_riasec_scores,
        progress,
        can_complete: context.test_state.can_complete,
        completed: false
      }
    });
  });
}
