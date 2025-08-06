import { supabase } from '../config/database';
import { AIServiceFactory } from './ai/AIServiceFactory';
import { ConversationMessage, ConversationRequest, ConversationResponse } from './ai/AIServiceInterface';
import { 
  TestSession, 
  TestResult,
  Career, 
  School,
  SchoolCareer,
  SessionRiasecScores,
  RiasecScores, 
  CareerRecommendation 
} from '../types/database';

interface SessionResults {
  sessionId: string;
  riasecScores: RiasecScores;
  confidenceLevel: number;
  conversationPhase: TestSession['current_phase'];
  careerRecommendations: Array<CareerRecommendation & { career: Career | null }>;
  conversationHistory: ConversationMessage[];
}

export class ConversationalSessionService {
  private aiService = AIServiceFactory.getDefaultService();

  async createConversationalSession(userId?: string): Promise<{
    sessionId: string;
    greeting: ConversationResponse;
  }> {
    // Create session in database using existing test_sessions table
    const { data: session, error } = await supabase
      .from('test_sessions')
      .insert({
        user_id: userId,
        status: 'in_progress',
        session_type: 'conversational',
        conversation_history: [],
        current_phase: 'greeting',
        confidence_level: 0
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create session: ${error.message}`);
    }

    // Get available careers for context  
    const { data: careers } = await supabase
      .from('careers')
      .select('id, name, description, riasec_code, realistic_score, investigative_score, artistic_score, social_score, enterprising_score, conventional_score')
      .not('primary_riasec_type', 'is', null)
      .limit(50);

    // Generate greeting with AI
    const greeting = await this.aiService.generateConversationalResponse({
      messages: [],
      context: {
        sessionId: session.id,
        userId,
        currentPhase: 'greeting',
        availableCareers: careers?.map(c => ({
          id: c.id,
          name: c.name || '',
          description: c.description || '',
          riasecCode: c.riasec_code,
          riasecScores: {
            R: c.realistic_score || 0,
            I: c.investigative_score || 0,
            A: c.artistic_score || 0,
            S: c.social_score || 0,
            E: c.enterprising_score || 0,
            C: c.conventional_score || 0
          }
        })) || []
      }
    });

    // Save AI greeting to conversation history
    const greetingMessage: ConversationMessage = {
      role: 'assistant',
      content: greeting.message,
      timestamp: new Date()
    };

    // Update session with greeting and next phase
    await supabase
      .from('test_sessions')
      .update({
        conversation_history: [greetingMessage],
        current_phase: greeting.nextPhase || 'exploration',
        ai_provider: process.env.AI_PROVIDER || 'gemini'
      })
      .eq('id', session.id);

    return {
      sessionId: session.id,
      greeting
    };
  }

  async processUserMessage(
    sessionId: string,
    userMessage: string
  ): Promise<ConversationResponse> {
    // Get current session
    const { data: session, error } = await supabase
      .from('test_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error || !session) {
      throw new Error('Session not found');
    }

    // Add user message to history
    const userMsg: ConversationMessage = {
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    };

    const conversationHistory = [
      ...(session.conversation_history as ConversationMessage[]),
      userMsg
    ];

    // Get available careers for context
    const { data: careers } = await supabase
      .from('careers')
      .select('id, name, description, riasec_code, realistic_score, investigative_score, artistic_score, social_score, enterprising_score, conventional_score')
      .not('primary_riasec_type', 'is', null);

    // Generate AI response
    const request: ConversationRequest = {
      messages: conversationHistory,
      context: {
        sessionId,
        userId: session.user_id,
        currentPhase: session.current_phase,
        userProfile: {
          previousResponses: conversationHistory
            .filter(msg => msg.role === 'user')
            .map(msg => ({
              question: 'Previous interaction',
              response: msg.content,
              riasecScores: session.riasec_scores
            }))
        },
        availableCareers: careers?.map(c => ({
          id: c.id,
          name: c.name,
          description: c.description,
          riasecCode: c.riasec_code,
          riasecScores: {
            R: c.realistic_score || 0,
            I: c.investigative_score || 0,
            A: c.artistic_score || 0,
            S: c.social_score || 0,
            E: c.enterprising_score || 0,
            C: c.conventional_score || 0
          }
        })) || []
      }
    };

    const aiResponse = await this.aiService.generateConversationalResponse(request);

    // Add AI response to history
    const aiMsg: ConversationMessage = {
      role: 'assistant',
      content: aiResponse.message,
      timestamp: new Date()
    };

    const updatedHistory = [...conversationHistory, aiMsg];

    // Update RIASEC scores in session_riasec_scores table if provided
    if (aiResponse.riasecAssessment?.scores) {
      const scores = aiResponse.riasecAssessment.scores;
      await supabase
        .from('session_riasec_scores')
        .upsert({
          session_id: sessionId,
          realistic_score: scores.R || 0,
          investigative_score: scores.I || 0,
          artistic_score: scores.A || 0,
          social_score: scores.S || 0,
          enterprising_score: scores.E || 0,
          conventional_score: scores.C || 0,
          updated_at: new Date().toISOString()
        });
    }

    // Update career recommendations in test_results if provided
    if (aiResponse.careerSuggestions?.length) {
      const careerRecommendations = aiResponse.careerSuggestions.map(suggestion => ({
        career_id: suggestion.careerId,
        confidence: suggestion.confidence,
        reasoning: suggestion.reasoning
      }));

      await supabase
        .from('test_results')
        .upsert({
          session_id: sessionId,
          career_recommendations: careerRecommendations,
          created_at: new Date().toISOString()
        });
    }

    // Update session conversation and phase
    await supabase
      .from('test_sessions')
      .update({
        conversation_history: updatedHistory,
        current_phase: aiResponse.nextPhase || session.current_phase,
        confidence_level: aiResponse.riasecAssessment?.confidence || session.confidence_level,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId);

    return aiResponse;
  }

  async getSessionResults(sessionId: string) {
    const { data: session, error } = await supabase
      .from('test_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error || !session) {
      throw new Error('Session not found');
    }

    // Get full career details for suggestions
    const careerIds = session.career_recommendations?.map((s: CareerRecommendation) => s.career_id) || [];
    
    let careerDetails: Career[] = [];
    if (careerIds.length > 0) {
      const { data: careers } = await supabase
        .from('careers')
        .select(`
          id, name, description, duration_years, 
          primary_riasec_type, riasec_code,
          realistic_score, investigative_score, artistic_score,
          social_score, enterprising_score, conventional_score,
          work_environment, key_skills,
          career_schools (
            schools (
              id, name, location, website
            )
          )
        `)
        .in('id', careerIds);

      careerDetails = careers || [];
    }

    const results: SessionResults = {
      sessionId: session.id,
      riasecScores: session.riasec_scores as RiasecScores,
      confidenceLevel: session.confidence_level,
      conversationPhase: session.current_phase,
      careerRecommendations: session.career_recommendations?.map((suggestion: CareerRecommendation) => {
        const career = careerDetails.find(c => c.id === suggestion.career_id);
        return {
          ...suggestion,
          career: career || null
        };
      }) || [],
      conversationHistory: session.conversation_history as ConversationMessage[]
    };

    return results;
  }

  private async updateSessionHistory(
    sessionId: string,
    newMessages: ConversationMessage[],
    newPhase?: string
  ) {
    const { data: session } = await supabase
      .from('test_sessions')
      .select('conversation_history')
      .eq('id', sessionId)
      .single();

    if (session) {
      const updatedHistory = [
        ...(session.conversation_history as ConversationMessage[]),
        ...newMessages
      ];

      const updateData: Partial<TestSession> = {
        conversation_history: updatedHistory,
        updated_at: new Date().toISOString()
      };

      if (newPhase && ['greeting', 'exploration', 'assessment', 'recommendation', 'complete'].includes(newPhase)) {
        updateData.current_phase = newPhase as TestSession['current_phase'];
      }

      await supabase
        .from('test_sessions')
        .update(updateData)
        .eq('id', sessionId);
    }
  }
}