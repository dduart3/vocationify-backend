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

    let aiResponse;
    try {
      console.log(`🤖 Calling AI service (${this.aiService.constructor.name}) for session ${sessionId}`);
      aiResponse = await this.aiService.generateConversationalResponse(request);
      console.log(`✅ AI service responded successfully`);
    } catch (error) {
      console.error(`❌ AI service failed for session ${sessionId}:`, error);
      console.error('📋 Request context:', {
        sessionId,
        messageCount: request.messages.length,
        currentPhase: request.context?.currentPhase,
        careersAvailable: request.context?.availableCareers?.length || 0
      });
      
      // Return fallback response
      aiResponse = {
        message: "Disculpa, tuve un problema técnico. ¿Podrías repetir tu respuesta? Estoy aquí para ayudarte con tu orientación vocacional.",
        intent: 'clarification' as const,
        nextPhase: request.context?.currentPhase || 'exploration' as const
      };
      console.log('🔄 Using fallback response due to AI service failure');
    }

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
    console.log('🤖 AI Response career suggestions:', aiResponse.careerSuggestions);
    if (aiResponse.careerSuggestions?.length) {
      const careerRecommendations = aiResponse.careerSuggestions.map(suggestion => ({
        career_id: suggestion.careerId,
        confidence: suggestion.confidence,
        reasoning: suggestion.reasoning
      }));

      console.log('💾 Saving career recommendations to test_results:', careerRecommendations);
      const { error: resultError } = await supabase
        .from('test_results')
        .upsert({
          session_id: sessionId,
          career_recommendations: careerRecommendations,
          final_riasec_profile: aiResponse.riasecAssessment?.scores || { R: 50, I: 50, A: 50, S: 50, E: 50, C: 50 },
          created_at: new Date().toISOString()
        });
        
      if (resultError) {
        console.error('❌ Error saving test results:', resultError);
      } else {
        console.log('✅ Career recommendations saved successfully');
      }
    } else {
      console.log('⚠️ No career suggestions from AI to save');
    }

    // Prepare session update
    const sessionUpdate: any = {
      conversation_history: updatedHistory,
      current_phase: aiResponse.nextPhase || session.current_phase,
      confidence_level: aiResponse.riasecAssessment?.confidence || session.confidence_level,
      updated_at: new Date().toISOString()
    };

    // If conversation is complete, update status and completion time
    if (aiResponse.nextPhase === 'complete') {
      sessionUpdate.status = 'completed';
      sessionUpdate.completed_at = new Date().toISOString();
    }

    // Update session
    await supabase
      .from('test_sessions')
      .update(sessionUpdate)
      .eq('id', sessionId);

    return aiResponse;
  }

  async getSessionResults(sessionId: string): Promise<SessionResults> {
    // Get session data
    const { data: session, error: sessionError } = await supabase
      .from('test_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      throw new Error('Session not found');
    }

    // Get RIASEC scores from session_riasec_scores table
    const { data: riasecData, error: riasecError } = await supabase
      .from('session_riasec_scores')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    // Get career recommendations from test_results table  
    const { data: testResults, error: resultsError } = await supabase
      .from('test_results')
      .select('career_recommendations')
      .eq('session_id', sessionId)
      .single();

    // Prepare RIASEC scores with fallback
    const riasecScores: RiasecScores = riasecData ? {
      R: riasecData.realistic_score || 0,
      I: riasecData.investigative_score || 0,
      A: riasecData.artistic_score || 0,
      S: riasecData.social_score || 0,
      E: riasecData.enterprising_score || 0,
      C: riasecData.conventional_score || 0
    } : { R: 50, I: 50, A: 50, S: 50, E: 50, C: 50 }; // Default to 50s if no scores

    // Get career details for recommendations
    const careerRecommendations: CareerRecommendation[] = testResults?.career_recommendations || [];
    const careerIds = careerRecommendations.map(rec => rec.career_id).filter(Boolean);
    
    let careerDetails: Career[] = [];
    if (careerIds.length > 0) {
      const { data: careers } = await supabase
        .from('careers')
        .select(`
          id, name, description, duration_years, 
          primary_riasec_type, riasec_code,
          realistic_score, investigative_score, artistic_score,
          social_score, enterprising_score, conventional_score,
          work_environment, key_skills
        `)
        .in('id', careerIds);

      careerDetails = careers || [];
    }

    const results: SessionResults = {
      sessionId: session.id,
      riasecScores,
      confidenceLevel: session.confidence_level || 80,
      conversationPhase: session.current_phase,
      careerRecommendations: careerRecommendations.map((suggestion: CareerRecommendation) => {
        const career = careerDetails.find(c => c.id === suggestion.career_id);
        return {
          ...suggestion,
          career: career || null
        };
      }),
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

      if (newPhase && ['greeting', 'exploration', 'assessment', 'recommendation', 'career_exploration', 'complete'].includes(newPhase)) {
        updateData.current_phase = newPhase as TestSession['current_phase'];
      }

      await supabase
        .from('test_sessions')
        .update(updateData)
        .eq('id', sessionId);
    }
  }
}