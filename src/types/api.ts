import { RiasecScore, Question } from './riasec';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface CreateSessionRequest {
  user_id?: string;
}

export interface CreateSessionResponse {
  session_id: string;
  question: Question;
  progress: number;
}

export interface SubmitResponseRequest {
  session_id: string;
  question_id: string;
  question_text: string;
  question_category: string;
  response_value: number;
  response_time: number;
}

export interface SubmitResponseResponse {
  question?: Question;
  current_scores?: RiasecScore;
  progress: number;
  can_complete: boolean;
  completed?: boolean;
  final_scores?: RiasecScore;
}

export interface GetSessionResponse {
  session_id: string;
  question_count: number;
  current_scores: RiasecScore;
  progress: number;
  can_complete: boolean;
  estimated_remaining: number;
}
