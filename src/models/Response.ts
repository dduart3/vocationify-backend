import { supabase } from '../config/database';
import { TestResponse, RiasecType, RiasecWeights } from '../types/riasec';

export interface ResponseData {
  id: string;
  session_id: string;
  question_id: string;
  question_text: string;
  question_category: RiasecType;
  response_value: number;
  response_time: number;
  question_order: number;
  riasec_weights: RiasecWeights;
  created_at: string;
}

export class ResponseModel {
  static async create(
    sessionId: string,
    questionId: string,
    questionText: string,
    questionCategory: RiasecType,
    responseValue: number,
    responseTime: number,
    questionOrder: number,
    riasecWeights: RiasecWeights
  ): Promise<ResponseData> {
    const { data, error } = await supabase
      .from('test_responses')
      .insert({
        session_id: sessionId,
        question_id: questionId,
        question_text: questionText,
        question_category: questionCategory,
        response_value: responseValue,
        response_time: responseTime,
        question_order: questionOrder,
        riasec_weights: riasecWeights
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create response: ${error.message}`);
    }

    return data;
  }

  static async findBySessionId(sessionId: string): Promise<ResponseData[]> {
    const { data, error } = await supabase
      .from('test_responses')
      .select('*')
      .eq('session_id', sessionId)
      .order('question_order', { ascending: true });

    if (error) {
      throw new Error(`Failed to find responses: ${error.message}`);
    }

    return data || [];
  }

  static async getNextQuestionOrder(sessionId: string): Promise<number> {
    const { data, error } = await supabase
      .from('test_responses')
      .select('question_order')
      .eq('session_id', sessionId)
      .order('question_order', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return 1; // No responses yet
      throw new Error(`Failed to get next question order: ${error.message}`);
    }

    return (data?.question_order || 0) + 1;
  }

  static async getResponseCount(sessionId: string): Promise<number> {
    const { count, error } = await supabase
      .from('test_responses')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId);

    if (error) {
      throw new Error(`Failed to get response count: ${error.message}`);
    }

    return count || 0;
  }
}
