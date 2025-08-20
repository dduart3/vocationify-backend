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
    currentPhase?: 'greeting' | 'enhanced_exploration' | 'career_matching' | 'reality_check' | 'final_results' | 'complete';
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
  nextPhase?: 'greeting' | 'enhanced_exploration' | 'career_matching' | 'reality_check' | 'final_results' | 'complete';
}

// Interface for discriminating questions about specific careers
export interface CareerDiscriminatingContext {
  career: {
    id: string;
    name: string;
    description: string;
    workEnvironment?: any;
    challenges?: string[];
    requirements?: string[];
  };
  userProfile: {
    riasecScores: Record<string, number>;
    interests: string[];
    previousResponses: Array<{
      question: string;
      response: string;
    }>;
  };
}

export interface DiscriminatingQuestion {
  question: string;
  careerAspect: 'physical' | 'emotional' | 'economic' | 'time_commitment' | 'social' | 'educational' | 'environmental';
  importance: 1 | 2 | 3 | 4 | 5;  // Impact on career fit
  followUpEnabled: boolean;
}

export abstract class AIServiceInterface {
  abstract generateConversationalResponse(request: ConversationRequest): Promise<ConversationResponse>;
  abstract assessRiasecFromConversation(messages: ConversationMessage[]): Promise<Record<string, number>>;
  abstract generateContextualQuestion(context: ConversationRequest['context']): Promise<string>;
  abstract generateCareerDiscriminatingQuestions(context: CareerDiscriminatingContext): Promise<DiscriminatingQuestion[]>;
}