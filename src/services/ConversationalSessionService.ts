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
  careerRecommendations: Array<{
    careerId: string;
    name: string;
    confidence: number;
    reasoning: string;
  }>;
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

    // Initialize RIASEC scores for the session (starting with 0s)
    const { error: riasecError } = await supabase
      .from('session_riasec_scores')
      .insert({
        session_id: session.id,
        realistic_score: 0,
        investigative_score: 0,
        artistic_score: 0,
        social_score: 0,
        enterprising_score: 0,
        conventional_score: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (riasecError) {
      console.error('Warning: Failed to initialize RIASEC scores:', riasecError);
      // Don't throw error - session can still work without initial RIASEC scores
    }

    // Get available careers for context  
    const { data: careers } = await supabase
      .from('careers')
      .select('id, name, description, riasec_code, realistic_score, investigative_score, artistic_score, social_score, enterprising_score, conventional_score')
      .not('primary_riasec_type', 'is', null)
      .limit(50);

    // Generate greeting with AI (with failover support)
    const greetingRequest = {
      messages: [],
      context: {
        sessionId: session.id,
        userId,
        currentPhase: 'greeting' as const,
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
    };

    console.log(`🤖 Calling AI service for session greeting`);
    const greeting = await this.aiService.generateConversationalResponse(greetingRequest);
    console.log(`✅ AI service generated greeting successfully`);

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

  /**
   * Enhanced phase handling for the new 4-phase methodology
   */
  private async handleEnhancedPhases(
    aiResponse: ConversationResponse,
    sessionId: string,
    conversationHistory: ConversationMessage[],
    originalRequest: ConversationRequest
  ): Promise<void> {
    const currentPhase = aiResponse.nextPhase;
    console.log(`🎯 Enhanced phase handling for: ${currentPhase}`);

    switch (currentPhase) {
      case 'enhanced_exploration':
        // Track exploration progress
        const userResponses = conversationHistory.filter(msg => msg.role === 'user').length;
        console.log(`📊 Enhanced exploration progress: ${userResponses}/15 questions answered`);
        
        if (userResponses >= 12) {
          console.log(`✅ Enhanced exploration nearly complete (${userResponses}/15) - prepare for career_matching`);
        }
        break;

      case 'career_matching':
        console.log('🎯 Entering career matching phase - analyzing user profile for top matches');
        // The AI will handle career matching internally, but we log for monitoring
        console.log('🔍 Career matching debug - aiResponse.careerSuggestions:', aiResponse.careerSuggestions);
        if (aiResponse.careerSuggestions?.length) {
          console.log(`✅ Career matching completed: ${aiResponse.careerSuggestions.length} careers identified`);
          
          // Store the identified careers for the reality check phase
          console.log('📝 Calling storeCareerMatchingResults...');
          await this.storeCareerMatchingResults(sessionId, aiResponse.careerSuggestions);
        } else {
          console.log('⚠️ No careerSuggestions found in AI response - cannot store for reality check');
        }
        break;

      case 'reality_check':
        console.log('⚠️ Entering reality check phase - generating discriminating questions');
        await this.handleRealityCheckPhase(sessionId, conversationHistory, originalRequest);
        break;

      case 'final_results':
        console.log('🏆 Entering final results phase - compiling comprehensive assessment');
        await this.prepareFinalResults(sessionId, conversationHistory);
        break;

      case 'complete':
        console.log('✅ Test completion confirmed - all phases completed successfully');
        break;

      default:
        console.log(`📝 Standard phase handling: ${currentPhase}`);
        break;
    }

    // Store career suggestions in metadata whenever they're provided (regardless of phase)
    if (aiResponse.careerSuggestions?.length) {
      console.log(`💾 Career suggestions found in response - storing for reality check phase`);
      await this.storeCareerMatchingResults(sessionId, aiResponse.careerSuggestions);
    }
  }

  /**
   * Store career matching results for reality check phase
   */
  private async storeCareerMatchingResults(
    sessionId: string,
    careerSuggestions: Array<{
      careerId: string;
      name: string;
      confidence: number;
      reasoning: string;
    }>
  ): Promise<void> {
    try {
      // Get current metadata to merge with
      const { data: currentSession } = await supabase
        .from('test_sessions')
        .select('metadata')
        .eq('id', sessionId)
        .single();

      const currentMetadata = currentSession?.metadata || {};

      const { error } = await supabase
        .from('test_sessions')
        .update({
          // Store top career matches in metadata for reality check
          metadata: { 
            ...currentMetadata,
            topCareerMatches: careerSuggestions.slice(0, 3),  // Store top 3 for reality check
            careerMatchingTimestamp: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      if (error) {
        console.error('❌ Failed to store career matching results:', error);
      } else {
        console.log(`✅ Stored top ${Math.min(careerSuggestions.length, 3)} career matches for reality check`);
      }
    } catch (error) {
      console.error('❌ Error storing career matching results:', error);
    }
  }

  /**
   * Handle reality check phase with discriminating questions
   */
  private async handleRealityCheckPhase(
    sessionId: string,
    conversationHistory: ConversationMessage[],
    originalRequest: ConversationRequest
  ): Promise<void> {
    try {
      // Get the stored career matches
      const { data: session } = await supabase
        .from('test_sessions')
        .select('metadata')
        .eq('id', sessionId)
        .single();

      const topCareerMatches = session?.metadata?.topCareerMatches;
      console.log('🔍 Reality check debug - Session metadata:', JSON.stringify(session?.metadata, null, 2));
      console.log('🔍 Reality check debug - topCareerMatches:', topCareerMatches);
      
      if (!topCareerMatches?.length) {
        console.log('⚠️ No career matches found for reality check - skipping discriminating question generation');
        return;
      }

      console.log(`🔍 Generating discriminating questions for ${topCareerMatches.length} careers`);

      // Generate discriminating questions for each career (this would be used in subsequent interactions)
      for (const careerMatch of topCareerMatches) {
        try {
          // Get full career details
          const { data: careerDetails } = await supabase
            .from('careers')
            .select('*')
            .eq('id', careerMatch.careerId)
            .single();

          if (careerDetails) {
            // Extract user profile from conversation
            const userProfile = {
              riasecScores: originalRequest.context?.userProfile?.previousResponses?.[0]?.riasecScores || 
                           { R: 50, I: 50, A: 50, S: 50, E: 50, C: 50 },
              interests: this.extractInterestsFromConversation(conversationHistory),
              previousResponses: conversationHistory
                .filter(msg => msg.role === 'user')
                .map(msg => ({
                  question: 'User response',
                  response: msg.content
                }))
            };

            // Generate discriminating questions using AI
            const discriminatingQuestions = await this.aiService.generateCareerDiscriminatingQuestions({
              career: {
                id: careerDetails.id,
                name: careerDetails.name || '',
                description: careerDetails.description || '',
                workEnvironment: careerDetails.work_environment,
                challenges: [], // Could be extracted from description
                requirements: careerDetails.key_skills || []
              },
              userProfile
            });

            console.log(`✅ Generated ${discriminatingQuestions.length} discriminating questions for ${careerDetails.name}`);

            // Store questions for potential use (optional - the AI will generate them dynamically)
            await this.storeDiscriminatingQuestions(sessionId, careerMatch.careerId, discriminatingQuestions);
          }
        } catch (error) {
          console.error(`❌ Failed to generate discriminating questions for career ${careerMatch.careerId}:`, error);
        }
      }
    } catch (error) {
      console.error('❌ Error in reality check phase handling:', error);
    }
  }

  /**
   * Extract interests from conversation history
   */
  private extractInterestsFromConversation(conversationHistory: ConversationMessage[]): string[] {
    const interests: string[] = [];
    const userMessages = conversationHistory.filter(msg => msg.role === 'user');
    
    // Simple keyword extraction (could be enhanced with NLP)
    const interestKeywords = [
      'programar', 'código', 'tecnología', 'computadoras',
      'ayudar', 'personas', 'social', 'comunidad',
      'crear', 'arte', 'diseño', 'creatividad',
      'analizar', 'investigar', 'ciencia', 'datos',
      'liderar', 'negocio', 'empresa', 'vender',
      'organizar', 'administrar', 'planificar'
    ];

    userMessages.forEach(msg => {
      const content = msg.content.toLowerCase();
      interestKeywords.forEach(keyword => {
        if (content.includes(keyword) && !interests.includes(keyword)) {
          interests.push(keyword);
        }
      });
    });

    return interests.length > 0 ? interests : ['general'];
  }

  /**
   * Store discriminating questions (optional - for potential future use)
   */
  private async storeDiscriminatingQuestions(
    sessionId: string,
    careerId: string,
    questions: Array<{ question: string; careerAspect: string; importance: number }>
  ): Promise<void> {
    try {
      // Could store in a separate table or in session metadata
      console.log(`📝 Discriminating questions for career ${careerId} generated and ready for use`);
      // For now, we'll just log them as the AI generates them dynamically
    } catch (error) {
      console.error('❌ Error storing discriminating questions:', error);
    }
  }

  /**
   * Prepare final results compilation
   */
  private async prepareFinalResults(sessionId: string, conversationHistory: ConversationMessage[]): Promise<void> {
    console.log('🏆 Preparing comprehensive final results');
    
    try {
      // Update session to indicate final results preparation
      await supabase
        .from('test_sessions')
        .update({
          metadata: {
            finalResultsTimestamp: new Date().toISOString(),
            totalUserResponses: conversationHistory.filter(msg => msg.role === 'user').length,
            completedPhases: ['enhanced_exploration', 'career_matching', 'reality_check']
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      console.log('✅ Final results preparation completed');
    } catch (error) {
      console.error('❌ Error preparing final results:', error);
    }
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

    console.log(`🤖 Calling AI service for session ${sessionId}`);
    const aiResponse = await this.aiService.generateConversationalResponse(request);
    console.log(`✅ AI service responded successfully`);

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
      const { error: incrementalRiasecError } = await supabase
        .from('session_riasec_scores')
        .update({
          realistic_score: scores.R || 0,
          investigative_score: scores.I || 0,
          artistic_score: scores.A || 0,
          social_score: scores.S || 0,
          enterprising_score: scores.E || 0,
          conventional_score: scores.C || 0,
          updated_at: new Date().toISOString()
        })
        .eq('session_id', sessionId);
        
      if (incrementalRiasecError) {
        console.error('⚠️ Failed to update incremental RIASEC scores:', incrementalRiasecError);
      } else {
        console.log('✅ Incremental RIASEC scores updated');
      }
    }

    // Update career recommendations in test_results if provided
    console.log('🤖 AI Response career suggestions:', aiResponse.careerSuggestions);
    if (aiResponse.careerSuggestions?.length) {
      // Get available career IDs to validate against
      const { data: availableCareers } = await supabase
        .from('careers')
        .select('id');
      
      const validCareerIds = new Set(availableCareers?.map(c => c.id) || []);
      
      // Filter out invalid career IDs that the AI might have hallucinated
      const validCareerSuggestions = aiResponse.careerSuggestions.filter(suggestion => {
        const isValid = validCareerIds.has(suggestion.careerId);
        if (!isValid) {
          console.error(`❌ AI hallucinated invalid career ID: ${suggestion.careerId}`);
        }
        return isValid;
      });
      
      if (validCareerSuggestions.length === 0) {
        console.error('❌ No valid career IDs found in AI response - all were hallucinated!');
        return aiResponse; // Return early to avoid saving invalid data
      }
      
      console.log(`✅ Validated ${validCareerSuggestions.length}/${aiResponse.careerSuggestions.length} career suggestions`);
      
      const careerRecommendations = validCareerSuggestions.map(suggestion => ({
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
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'session_id'
        });
        
      if (resultError) {
        console.error('❌ Error saving test results:', resultError);
      } else {
        console.log('✅ Career recommendations saved successfully');
      }
    } else {
      console.log('⚠️ No career suggestions from AI to save');
    }

    // 🎯 ENHANCED PHASE HANDLING - Special logic for new phases
    await this.handleEnhancedPhases(aiResponse, sessionId, updatedHistory, request);

    // Prepare session update
    const sessionUpdate: any = {
      conversation_history: updatedHistory,
      current_phase: aiResponse.nextPhase || session.current_phase,
      confidence_level: aiResponse.riasecAssessment?.confidence || session.confidence_level,
      updated_at: new Date().toISOString()
    };

    // If conversation is complete, perform final RIASEC assessment and update status
    if (aiResponse.nextPhase === 'complete') {
      console.log(`✅ Session ${sessionId} marked as complete - performing final RIASEC assessment`);
      
      try {
        // Perform comprehensive RIASEC assessment from entire conversation
        const finalRiasecScores = await this.aiService.assessRiasecFromConversation(updatedHistory);
        console.log('📊 Final RIASEC assessment completed:', finalRiasecScores);
        
        // Update RIASEC scores in database with final assessment
        const { error: riasecUpdateError } = await supabase
          .from('session_riasec_scores')
          .update({
            realistic_score: finalRiasecScores.R || 0,
            investigative_score: finalRiasecScores.I || 0,
            artistic_score: finalRiasecScores.A || 0,
            social_score: finalRiasecScores.S || 0,
            enterprising_score: finalRiasecScores.E || 0,
            conventional_score: finalRiasecScores.C || 0,
            updated_at: new Date().toISOString()
          })
          .eq('session_id', sessionId);
          
        if (riasecUpdateError) {
          console.error('❌ Failed to save final RIASEC scores:', riasecUpdateError);
        } else {
          console.log('✅ Final RIASEC scores saved to database');
        }
        
        // Update the test results with final RIASEC profile
        const { error: testResultsError } = await supabase
          .from('test_results')
          .update({
            final_riasec_profile: finalRiasecScores,
            updated_at: new Date().toISOString()
          })
          .eq('session_id', sessionId);
          
        if (testResultsError) {
          console.error('❌ Failed to update test results with RIASEC profile:', testResultsError);
        } else {
          console.log('✅ Final RIASEC profile updated in test results');
        }
        
      } catch (error) {
        console.error('❌ Error during final RIASEC assessment:', error);
        // Continue with completion even if RIASEC assessment fails
      }
      
      sessionUpdate.status = 'completed';
      sessionUpdate.completed_at = new Date().toISOString();
    } else {
      console.log(`📝 Session ${sessionId} continues with phase: ${aiResponse.nextPhase}`);
    }

    // Update session
    await supabase
      .from('test_sessions')
      .update(sessionUpdate)
      .eq('id', sessionId);

    return aiResponse;
  }

  async getSessionDetails(sessionId: string): Promise<{
    sessionId: string;
    status: string;
    currentPhase: string;
    conversationHistory: ConversationMessage[];
    startedAt: string;
    updatedAt: string;
  }> {
    // Get session data
    const { data: session, error: sessionError } = await supabase
      .from('test_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      throw new Error('Session not found');
    }

    return {
      sessionId: session.id,
      status: session.status,
      currentPhase: session.current_phase,
      conversationHistory: session.conversation_history || [],
      startedAt: session.started_at,
      updatedAt: session.updated_at
    };
  }

  async updateSessionHeartbeat(sessionId: string): Promise<void> {
    const { error } = await supabase
      .from('test_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (error) {
      throw new Error('Failed to update session heartbeat');
    }
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
          careerId: suggestion.career_id,
          name: career?.name || 'Carrera no disponible',
          confidence: suggestion.confidence,
          reasoning: suggestion.reasoning
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

      if (newPhase && ['greeting', 'enhanced_exploration', 'career_matching', 'reality_check', 'final_results', 'complete'].includes(newPhase)) {
        updateData.current_phase = newPhase as TestSession['current_phase'];
      }

      await supabase
        .from('test_sessions')
        .update(updateData)
        .eq('id', sessionId);
    }
  }
}