// Clean Vocational Test Service - Simple CRUD operations only
// No complex logic, no fallbacks, no session modifications

import { supabase } from '../config/database'
import { CleanAIService } from './CleanAIService'

interface VocationalSession {
  id: string
  user_id: string
  current_phase: 'exploration' | 'career_matching' | 'reality_check' | 'complete'
  conversation_history: Array<{
    role: 'user' | 'assistant'
    content: string
    timestamp: string
  }>
  riasec_scores: {
    realistic: number
    investigative: number
    artistic: number
    social: number
    enterprising: number
    conventional: number
  }
  recommendations: Array<{
    careerId: string
    name: string
    confidence: number
    reasoning: string
  }>
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

export class VocationalTestService {
  private aiService: CleanAIService

  constructor() {
    this.aiService = new CleanAIService()
  }

  // Start new session
  async startSession(userId: string): Promise<VocationalSession> {
    try {
      // Create initial session
      const { data, error } = await supabase
        .from('vocational_sessions')
        .insert({
          user_id: userId,
          current_phase: 'exploration',
          conversation_history: [],
          riasec_scores: {
            realistic: 0,
            investigative: 0,
            artistic: 0,
            social: 0,
            enterprising: 0,
            conventional: 0
          },
          recommendations: [],
          metadata: {}
        })
        .select()
        .single()

      if (error) throw error
      console.log('✅ Clean session created:', data.id)
      
      // Get AI's initial greeting automatically
      console.log('🤖 Getting AI initial greeting...')
      const aiResponse = await this.aiService.processMessage(
        'INICIO_SESION', // Special trigger for initial greeting
        'exploration',
        [] // Empty conversation history
      )

      // Add AI's greeting to conversation history
      const aiMessageObj = {
        role: 'assistant' as const,
        content: aiResponse.message,
        timestamp: new Date().toISOString()
      }

      // Update session with AI's initial message
      const { data: updatedSession, error: updateError } = await supabase
        .from('vocational_sessions')
        .update({
          conversation_history: [aiMessageObj],
          updated_at: new Date().toISOString()
        })
        .eq('id', data.id)
        .select()
        .single()

      if (updateError) throw updateError

      console.log('✅ Clean session started with AI greeting:', updatedSession.id)
      return updatedSession as VocationalSession

    } catch (error) {
      console.error('❌ Failed to start session:', error)
      throw new Error('Failed to create vocational session')
    }
  }

  // Get existing session
  async getSession(sessionId: string): Promise<VocationalSession> {
    try {
      const { data, error } = await supabase
        .from('vocational_sessions')
        .select('*')
        .eq('id', sessionId)
        .single()

      if (error) throw error
      if (!data) throw new Error('Session not found')

      return data as VocationalSession

    } catch (error) {
      console.error('❌ Failed to get session:', error)
      throw new Error('Session not found')
    }
  }

  // Process message and update session
  async processMessage(sessionId: string, userMessage: string): Promise<{
    session: VocationalSession
    aiResponse: {
      message: string
      recommendations?: any[]
      riasecScores?: any
    }
  }> {
    try {
      // Get current session
      const session = await this.getSession(sessionId)

      // Add user message to history
      const userMessageObj = {
        role: 'user' as const,
        content: userMessage,
        timestamp: new Date().toISOString()
      }

      const updatedHistory = [...session.conversation_history, userMessageObj]

      // Get AI response
      const aiResponse = await this.aiService.processMessage(
        userMessage,
        session.current_phase,
        updatedHistory
      )

      // Add AI response to history
      const aiMessageObj = {
        role: 'assistant' as const,
        content: aiResponse.message,
        timestamp: new Date().toISOString()
      }

      const finalHistory = [...updatedHistory, aiMessageObj]

      // Prepare update data
      const updateData: any = {
        conversation_history: finalHistory,
        updated_at: new Date().toISOString()
      }

      // Check for reality check auto-completion based on message count
      if (session.current_phase === 'reality_check' && (!aiResponse.nextPhase || aiResponse.nextPhase === 'reality_check')) {
        const realityCheckStartCount = session.metadata?.realityCheckStartMessageCount || 0
        const currentMessageCount = finalHistory.length
        const realityCheckMessages = currentMessageCount - realityCheckStartCount
        
        console.log(`📊 Reality Check Debug:`)
        console.log(`   - Start count: ${realityCheckStartCount}`)
        console.log(`   - Current total: ${currentMessageCount}`)
        console.log(`   - Reality check messages: ${realityCheckMessages}`)
        console.log(`   - AI nextPhase: ${aiResponse.nextPhase}`)
        
        // Force completion after 12 reality check messages (6 Q&A pairs)
        if (realityCheckMessages >= 12) {
          console.log(`🎯 Auto-completing reality check after ${realityCheckMessages} messages`)
          
          // Force AI to provide completion response
          const completionResponse = await this.aiService.processMessage(
            'FORZAR_COMPLETAR_REALITY_CHECK', // Special completion trigger
            'complete',
            finalHistory
          )
          
          // Replace the AI response with completion
          aiResponse.message = completionResponse.message
          aiResponse.nextPhase = 'complete'
          aiResponse.recommendations = completionResponse.recommendations
          aiResponse.riasecScores = completionResponse.riasecScores || aiResponse.riasecScores
          
          console.log('✅ Reality check auto-completed with final recommendations')
        }
      }

      // Update phase if AI indicates
      if (aiResponse.nextPhase) {
        updateData.current_phase = aiResponse.nextPhase
        console.log(`🔄 Phase transition: ${session.current_phase} → ${aiResponse.nextPhase}`)
      }

      // Update recommendations if provided
      if (aiResponse.recommendations) {
        updateData.recommendations = aiResponse.recommendations
        console.log(`💼 Updated recommendations: ${aiResponse.recommendations.length} careers`)
      }

      // Update RIASEC scores if provided
      if (aiResponse.riasecScores) {
        updateData.riasec_scores = aiResponse.riasecScores
        console.log('📊 Updated RIASEC scores')
      }

      // Note: Reality check completion is now handled directly by AI nextPhase transition

      // Update session in database
      const { data: updatedSession, error } = await supabase
        .from('vocational_sessions')
        .update(updateData)
        .eq('id', sessionId)
        .select()
        .single()

      if (error) throw error

      console.log(`✅ Message processed successfully for session ${sessionId}`)

      return {
        session: updatedSession as VocationalSession,
        aiResponse: {
          message: aiResponse.message,
          recommendations: aiResponse.recommendations,
          riasecScores: aiResponse.riasecScores
        }
      }

    } catch (error) {
      console.error('❌ Failed to process message:', error)
      throw new Error('Failed to process message')
    }
  }

  // Transition to specific phase
  async transitionToPhase(sessionId: string, targetPhase: 'exploration' | 'career_matching' | 'reality_check' | 'complete'): Promise<VocationalSession> {
    try {
      // Get current session to access conversation history
      const currentSession = await this.getSession(sessionId)

      // Update phase in database
      const { data, error } = await supabase
        .from('vocational_sessions')
        .update({
          current_phase: targetPhase,
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId)
        .select()
        .single()

      if (error) throw error

      console.log(`✅ Phase transitioned to: ${targetPhase}`)

      // For reality_check phase, automatically get first AI question
      if (targetPhase === 'reality_check') {
        console.log('🎯 Getting initial reality check question...')
        
        const aiResponse = await this.aiService.processMessage(
          'INICIAR_REALITY_CHECK', // Special trigger for reality check start
          'reality_check',
          currentSession.conversation_history
        )

        // Add AI's initial reality check question to conversation history
        const aiMessageObj = {
          role: 'assistant' as const,
          content: aiResponse.message,
          timestamp: new Date().toISOString()
        }

        const updatedHistory = [...currentSession.conversation_history, aiMessageObj]

        // Update session with AI's reality check question and track start
        const { data: updatedSession, error: updateError } = await supabase
          .from('vocational_sessions')
          .update({
            conversation_history: updatedHistory,
            metadata: {
              ...currentSession.metadata,
              realityCheckStartMessageCount: currentSession.conversation_history.length
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', sessionId)
          .select()
          .single()

        if (updateError) throw updateError

        console.log('✅ Reality check started with initial AI question')
        return updatedSession as VocationalSession
      }

      return data as VocationalSession

    } catch (error) {
      console.error('❌ Failed to transition phase:', error)
      throw new Error('Failed to transition phase')
    }
  }

  // Special transition from reality_check to complete with final recommendations
  async completeRealityCheck(sessionId: string): Promise<VocationalSession> {
    try {
      const currentSession = await this.getSession(sessionId)

      if (currentSession.current_phase !== 'reality_check') {
        throw new Error('Can only complete reality check from reality_check phase')
      }

      // Get AI's final message with career recommendations
      console.log('🎯 Getting final reality check completion message...')
      const aiResponse = await this.aiService.processMessage(
        'COMPLETAR_REALITY_CHECK', // Special trigger for completion
        'complete', // Use complete phase for this message
        currentSession.conversation_history
      )

      // Add AI's final message to conversation history
      const aiMessageObj = {
        role: 'assistant' as const,
        content: aiResponse.message,
        timestamp: new Date().toISOString()
      }

      const updatedHistory = [...currentSession.conversation_history, aiMessageObj]

      // Prepare update data
      const updateData: any = {
        current_phase: 'complete',
        conversation_history: updatedHistory,
        updated_at: new Date().toISOString()
      }

      // Update recommendations if provided
      if (aiResponse.recommendations) {
        updateData.recommendations = aiResponse.recommendations
        console.log(`💼 Final recommendations: ${aiResponse.recommendations.length} careers`)
      }

      // Update RIASEC scores if provided
      if (aiResponse.riasecScores) {
        updateData.riasec_scores = aiResponse.riasecScores
        console.log('📊 Final RIASEC scores updated')
      }

      // Update session in database
      const { data: updatedSession, error } = await supabase
        .from('vocational_sessions')
        .update(updateData)
        .eq('id', sessionId)
        .select()
        .single()

      if (error) throw error

      console.log('✅ Reality check completed with final recommendations')
      return updatedSession as VocationalSession

    } catch (error) {
      console.error('❌ Failed to complete reality check:', error)
      throw new Error('Failed to complete reality check')
    }
  }

  // Get session statistics (optional helper)
  async getSessionStats(sessionId: string): Promise<{
    messageCount: number
    currentPhase: string
    hasRecommendations: boolean
    isComplete: boolean
  }> {
    try {
      const session = await this.getSession(sessionId)

      return {
        messageCount: session.conversation_history.length,
        currentPhase: session.current_phase,
        hasRecommendations: session.recommendations.length > 0,
        isComplete: session.current_phase === 'complete'
      }

    } catch (error) {
      console.error('❌ Failed to get session stats:', error)
      throw new Error('Failed to get session statistics')
    }
  }
}