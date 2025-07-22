export type RiasecType = 'realistic' | 'investigative' | 'artistic' | 'social' | 'enterprising' | 'conventional';

export interface RiasecScore {
  realistic: number;
  investigative: number;
  artistic: number;
  social: number;
  enterprising: number;
  conventional: number;
}

export interface RiasecWeights {
  R: number;
  I: number;
  A: number;
  S: number;
  E: number;
  C: number;
}

export interface Question {
  id: string;
  text: string;
  category: RiasecType;
  riasec_weights: RiasecWeights;
  response_type: 'scale';
  scale: {
    min: number;
    max: number;
  };
}

export interface TestResponse {
  id: string;
  session_id: string;
  question_id: string;
  question_text: string;
  question_category: RiasecType;
  response_value: number;
  response_time: number;
  question_order: number;
  riasec_weights: RiasecWeights;
  created_at: Date;
}

export interface SessionContext {
  session_id: string;
  question_count: number;
  responses: TestResponse[];
  current_riasec_scores: RiasecScore;
  riasec_analysis: {
    strongest_types: RiasecType[];
    weakest_types: RiasecType[];
    underexplored_types: RiasecType[];
    question_distribution: Record<RiasecType, number>;
  };
  test_state: {
    can_complete: boolean;
    should_continue: boolean;
    estimated_remaining_questions: number;
  };
  asked_questions: string[];
}
