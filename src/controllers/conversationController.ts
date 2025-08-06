import { Request, Response } from 'express';
import { ConversationalSessionService } from '../services/ConversationalSessionService';
import { ApiResponse } from '../types/api';
import { asyncHandler } from '../middleware/errorHandler';

export class ConversationController {
  private conversationService = new ConversationalSessionService();

  // Create new conversational session
  createConversationalSession = asyncHandler(async (
    req: Request<{}, ApiResponse, { user_id?: string }>, 
    res: Response<ApiResponse>
  ) => {
    const { user_id } = req.body;
    
    const result = await this.conversationService.createConversationalSession(user_id);
    
    res.status(201).json({
      success: true,
      data: {
        session_id: result.sessionId,
        greeting: result.greeting
      }
    });
  });

  // Send user message and get AI response
  sendMessage = asyncHandler(async (
    req: Request<{}, ApiResponse, { session_id: string; message: string }>,
    res: Response<ApiResponse>
  ) => {
    const { session_id, message } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    const response = await this.conversationService.processUserMessage(session_id, message);

    res.json({
      success: true,
      data: response
    });
  });

  // Get conversation session results
  getSessionResults = asyncHandler(async (
    req: Request<{ sessionId: string }>,
    res: Response<ApiResponse>
  ) => {
    const { sessionId } = req.params;
    
    const results = await this.conversationService.getSessionResults(sessionId);
    
    res.json({
      success: true,
      data: results
    });
  });

  // Get conversation history
  getConversationHistory = asyncHandler(async (
    req: Request<{ sessionId: string }>,
    res: Response<ApiResponse>
  ) => {
    const { sessionId } = req.params;
    
    const results = await this.conversationService.getSessionResults(sessionId);
    
    res.json({
      success: true,
      data: {
        conversation_history: results.conversationHistory,
        current_phase: results.conversationPhase,
        riasec_scores: results.riasecScores
      }
    });
  });
}