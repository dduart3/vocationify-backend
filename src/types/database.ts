// Database entity types matching your existing schema

export interface Profile {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  address?: string;
  phone?: string;
  role_id?: number;
  avatar_url?: string;
  location?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface Role {
  id: number;
  name?: string;
  description?: string;
  created_at?: string;
}

export interface Career {
  id: string;
  name?: string;
  description?: string;
  duration_years?: number;
  primary_riasec_type?: string;
  secondary_riasec_type?: string;
  riasec_code?: string;
  realistic_score?: number;
  investigative_score?: number;
  artistic_score?: number;
  social_score?: number;
  enterprising_score?: number;
  conventional_score?: number;
  work_environment?: string[];
  key_skills?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface School {
  id: string;
  name?: string;
  description?: string;
  address?: string;
  website_url?: string;
  phone_number?: string;
  email?: string;
  logo_url?: string;
  location?: Record<string, unknown>;
  type?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SchoolCareer {
  id: string;
  school_id: string;
  career_id: string;
  shifts?: string;
  admission_requirements?: string;
  created_at?: string;
}

// Extended test session (supports both structured and conversational)
export interface TestSession {
  id: string;
  user_id?: string;
  status?: string;
  started_at?: string;
  completed_at?: string;
  created_at?: string;
  updated_at?: string;
  // New fields for conversational support
  session_type?: 'structured' | 'conversational';
  conversation_history?: ConversationMessage[];
  current_phase?: 'greeting' | 'enhanced_exploration' | 'career_matching' | 'reality_check' | 'final_results' | 'complete';
  ai_provider?: string;
  confidence_level?: number;
  metadata?: Record<string, any>;
}

export interface TestResult {
  id: string;
  session_id: string;
  final_riasec_profile?: Record<string, unknown>;
  personality_description?: string;
  created_at?: string;
  // New field for conversational recommendations
  career_recommendations?: CareerRecommendation[];
}

export interface TestResponse {
  id: string;
  session_id: string;
  question_id?: string;
  question_text?: string;
  question_category?: string;
  response_value?: number;
  response_time?: number;
  question_order?: number;
  riasec_weights?: Record<string, unknown>;
  created_at?: string;
}

export interface SessionRiasecScores {
  id: string;
  session_id: string;
  realistic_score?: number;
  investigative_score?: number;
  artistic_score?: number;
  social_score?: number;
  enterprising_score?: number;
  conventional_score?: number;
  updated_at?: string;
}

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export interface RiasecScores {
  R: number;
  I: number;
  A: number;
  S: number;
  E: number;
  C: number;
}

export interface CareerRecommendation {
  career_id: string;
  confidence: number;
  reasoning: string;
}

// Extended types for API responses
export interface CareerWithSchools extends Career {
  career_schools: Array<{
    schools: School;
  }>;
}

export interface SessionResults {
  sessionId: string;
  riasecScores: RiasecScores;
  confidenceLevel: number;
  conversationPhase: TestSession['current_phase'];
  careerRecommendations: Array<CareerRecommendation & { career: Career | null }>;
  conversationHistory: ConversationMessage[];
}