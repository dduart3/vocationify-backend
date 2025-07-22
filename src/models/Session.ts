import { supabase } from '../config/database';
import { RiasecScore } from '../types/riasec';

export interface SessionData {
  id: string;
  user_id?: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  started_at: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface SessionRiasecScoreData {
  id: string;
  session_id: string;
  realistic_score: number;
  investigative_score: number;
  artistic_score: number;
  social_score: number;
  enterprising_score: number;
  conventional_score: number;
  updated_at: string;
}

export class SessionModel {
  static async create(userId?: string): Promise<SessionData> {
    const { data, error } = await supabase
      .from('test_sessions')
      .insert({
        user_id: userId,
        status: 'in_progress'
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create session: ${error.message}`);
    }

    return data;
  }

  static async findById(sessionId: string): Promise<SessionData | null> {
    const { data, error } = await supabase
      .from('test_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to find session: ${error.message}`);
    }

    return data;
  }

  static async updateStatus(sessionId: string, status: SessionData['status']): Promise<void> {
    const updateData: any = { status };
    
    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('test_sessions')
      .update(updateData)
      .eq('id', sessionId);

    if (error) {
      throw new Error(`Failed to update session status: ${error.message}`);
    }
  }

  static async createRiasecScores(sessionId: string): Promise<void> {
    const { error } = await supabase
      .from('session_riasec_scores')
      .insert({
        session_id: sessionId,
        realistic_score: 0,
        investigative_score: 0,
        artistic_score: 0,
        social_score: 0,
        enterprising_score: 0,
        conventional_score: 0
      });

    if (error) {
      throw new Error(`Failed to create RIASEC scores: ${error.message}`);
    }
  }

  static async getRiasecScores(sessionId: string): Promise<SessionRiasecScoreData | null> {
    const { data, error } = await supabase
      .from('session_riasec_scores')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get RIASEC scores: ${error.message}`);
    }

    return data;
  }

  static async updateRiasecScores(sessionId: string, scores: Partial<RiasecScore>): Promise<void> {
    const updateData: any = {};
    
    if (scores.realistic !== undefined) updateData.realistic_score = scores.realistic;
    if (scores.investigative !== undefined) updateData.investigative_score = scores.investigative;
    if (scores.artistic !== undefined) updateData.artistic_score = scores.artistic;
    if (scores.social !== undefined) updateData.social_score = scores.social;
    if (scores.enterprising !== undefined) updateData.enterprising_score = scores.enterprising;
    if (scores.conventional !== undefined) updateData.conventional_score = scores.conventional;

    const { error } = await supabase
      .from('session_riasec_scores')
      .update(updateData)
      .eq('session_id', sessionId);

    if (error) {
      throw new Error(`Failed to update RIASEC scores: ${error.message}`);
    }
  }
}
