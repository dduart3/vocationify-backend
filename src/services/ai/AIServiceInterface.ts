// Abstract interface for AI services
export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export interface ConversationRequest {
  messages: ConversationMessage[];
  context?: {
    userId?: string;
    sessionId?: string;
    currentPhase?: 'greeting' | 'exploration' | 'assessment' | 'recommendation' | 'career_exploration';
    userProfile?: {
      name?: string;
      age?: number;  
      interests?: string[];
      previousResponses?: Array<{
        question: string;
        response: string;
        riasecScores: Record<string, number>;
      }>;
    };
    availableCareers?: Array<{
      id: string;
      name: string;
      description: string;
      riasecCode?: string;
      riasecScores?: Record<string, number>;
    }>;
  };
}

export interface ConversationResponse {
  message: string;
  intent?: 'question' | 'clarification' | 'assessment' | 'recommendation' | 'completion_check' | 'farewell';
  suggestedFollowUp?: string[];
  riasecAssessment?: {
    scores: Record<string, number>;
    confidence: number;
    reasoning: string;
  };
  careerSuggestions?: Array<{
    careerId: string;
    name: string;
    confidence: number;
    reasoning: string;
  }>;
  nextPhase?: 'greeting' | 'exploration' | 'assessment' | 'recommendation' | 'career_exploration' | 'complete';
}

export abstract class AIServiceInterface {
  abstract generateConversationalResponse(request: ConversationRequest): Promise<ConversationResponse>;
  abstract assessRiasecFromConversation(messages: ConversationMessage[]): Promise<Record<string, number>>;
  abstract generateContextualQuestion(context: ConversationRequest['context']): Promise<string>;
}