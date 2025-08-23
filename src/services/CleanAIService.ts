// Clean AI Service - No complex logic, bulletproof prompts
// Prevents career ID hallucination by using real database careers only

import { supabase } from '../config/database'

interface AIResponse {
  message: string
  nextPhase?: 'exploration' | 'career_matching' | 'reality_check' | 'complete'
  recommendations?: Array<{
    careerId: string
    name: string
    confidence: number
    reasoning: string
  }>
  riasecScores?: {
    realistic: number
    investigative: number
    artistic: number
    social: number
    enterprising: number
    conventional: number
  }
}

export class CleanAIService {
  private careers: any[] = []
  
  constructor() {
    this.loadCareers()
  }

  private async loadCareers() {
    try {
      const { data, error } = await supabase
        .from('careers')
        .select('*')
      
      if (error) throw error
      this.careers = data || []
      console.log(`✅ Loaded ${this.careers.length} careers for AI context`)
    } catch (error) {
      console.error('❌ Failed to load careers:', error)
      this.careers = []
    }
  }

  private getCareersContext(): string {
    if (this.careers.length === 0) return "No careers available"
    
    return this.careers.map(career => 
      `ID: ${career.id} | NAME: ${career.name} | DESC: ${career.description || 'N/A'}`
    ).join('\n')
  }

  async processMessage(
    message: string, 
    currentPhase: string, 
    conversationHistory: any[]
  ): Promise<AIResponse> {
    
    const careersContext = this.getCareersContext()
    
    // Phase-specific prompts
    const prompts = {
      exploration: this.getExplorationPrompt(careersContext),
      career_matching: this.getCareerMatchingPrompt(careersContext),
      reality_check: this.getRealityCheckPrompt(careersContext),
      complete: this.getCompletePrompt(careersContext)
    }

    const systemPrompt = prompts[currentPhase as keyof typeof prompts] || prompts.exploration

    try {
      // Use OpenAI service here
      const { OpenAIService } = await import('./ai/OpenAIService')
      const { config } = await import('../config/environment')
      
      if (!config.ai.openaiApiKey) {
        throw new Error('OpenAI API key not configured')
      }
      
      const openAIService = new OpenAIService(config.ai.openaiApiKey)
      
      // Prepare messages for OpenAI service
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        ...conversationHistory.map(msg => ({ 
          role: msg.role as 'user' | 'assistant', 
          content: msg.content 
        })),
        { role: 'user' as const, content: message }
      ]

      // Create conversation request
      const request = {
        messages,
        context: {
          currentPhase: currentPhase as 'greeting' | 'enhanced_exploration' | 'career_matching' | 'reality_check' | 'final_results' | 'complete',
          availableCareers: this.careers
        }
      }

      const response = await openAIService.generateConversationalResponse(request)

      return this.parseAIResponse(response, currentPhase)
      
    } catch (error) {
      console.error(`❌ AI service error in ${currentPhase}:`, error)
      throw new Error('Failed to process AI response')
    }
  }

  private getExplorationPrompt(careersContext: string): string {
    return `
Eres ARIA, un consejero vocacional experto para estudiantes de bachillerato en Venezuela.

CONTEXTO INTERNO (solo para ti, el usuario NO sabe esto):
${careersContext}

FASE ACTUAL: EXPLORACIÓN PROFUNDA
OBJETIVO: Hacer 15+ preguntas para entender completamente los intereses, habilidades y personalidad del estudiante.

INSTRUCCIONES ABSOLUTAS:
1. Haz preguntas abiertas y conversacionales sobre intereses, materias favoritas, actividades que disfrutan
2. NUNCA menciones carreras específicas o hagas recomendaciones en esta fase
3. NUNCA hagas referencia a la lista de carreras que tienes
4. Enfócate en conocer al estudiante como persona
5. Usa lenguaje natural y amigable apropiado para adolescentes
6. Después de 15+ intercambios significativos, indica nextPhase: "career_matching"

EJEMPLO DE PREGUNTA: "¡Hola! Soy ARIA y estoy aquí para ayudarte a descubrir qué carrera podría ser perfecta para ti. Para empezar, ¿qué materias en el colegio realmente disfrutas y por qué te gustan?"

FORMATO DE RESPUESTA:
{
  "message": "tu pregunta o comentario aquí",
  "nextPhase": null (o "career_matching" cuando termines exploración)
}
`
  }

  private getCareerMatchingPrompt(careersContext: string): string {
    return `
Eres ARIA, un consejero vocacional experto para estudiantes de bachillerato en Venezuela.

CONTEXTO INTERNO (solo para ti, el usuario NO sabe esto):
${careersContext}

FASE ACTUAL: RECOMENDACIONES DE CARRERAS
OBJETIVO: Mostrar las 3-5 mejores carreras que coincidan con el perfil del estudiante.

INSTRUCCIONES ABSOLUTAS:
1. Analiza toda la conversación para determinar intereses y habilidades
2. USA ÚNICAMENTE LOS IDs de carreras de la lista anterior
3. PROHIBIDO ABSOLUTO crear o inventar IDs de carreras
4. Proporciona exactamente 3-5 recomendaciones
5. Incluye porcentaje de compatibilidad y reasoning para cada una
6. Termina diciendo que pueden continuar al "Reality Check" para validar
7. Indica nextPhase: "reality_check"

FORMATO DE RESPUESTA:
{
  "message": "Basado en nuestras conversaciones, estas son las carreras que mejor se adaptan a tu perfil:",
  "recommendations": [
    {
      "careerId": "ID_EXACTO_DE_LA_LISTA",
      "name": "NOMBRE_EXACTO_DE_LA_LISTA", 
      "confidence": 85,
      "reasoning": "explicación de por qué encaja"
    }
  ],
  "nextPhase": "reality_check",
  "riasecScores": {
    "realistic": 3,
    "investigative": 5,
    "artistic": 4,
    "social": 2,
    "enterprising": 3,
    "conventional": 2
  }
}
`
  }

  private getRealityCheckPrompt(careersContext: string): string {
    return `
Eres ARIA, un consejero vocacional experto para estudiantes de bachillerato en Venezuela.

CONTEXTO INTERNO (solo para ti, el usuario NO sabe esto):
${careersContext}

FASE ACTUAL: REALITY CHECK
OBJETIVO: Hacer exactamente 6 preguntas discriminantes para validar las recomendaciones.

INSTRUCCIONES ABSOLUTAS:
1. Haz preguntas específicas sobre situaciones reales de las carreras recomendadas
2. NUNCA menciones carreras por nombre, haz preguntas situacionales
3. Ejemplos: "¿Te emocionaría pasar horas resolviendo problemas complejos?" 
4. Después de exactamente 6 preguntas respondidas, indica nextPhase: "complete"
5. Enfócate en validar compatibilidad real con las carreras

FORMATO DE RESPUESTA:
{
  "message": "tu pregunta discriminante aquí",
  "nextPhase": null (o "complete" después de 6 preguntas)
}
`
  }

  private getCompletePrompt(careersContext: string): string {
    return `
Eres ARIA, un consejero vocacional experto para estudiantes de bachillerato en Venezuela.

FASE ACTUAL: COMPLETADO
OBJETIVO: Confirmar finalización del test.

INSTRUCCIONES:
1. Confirma que el test ha sido completado
2. Indica nextPhase: "complete"

FORMATO DE RESPUESTA:
{
  "message": "¡Excelente! Has completado tu evaluación vocacional. Tus resultados están listos.",
  "nextPhase": "complete"
}
`
  }

  private parseAIResponse(response: any, currentPhase: string): AIResponse {
    try {
      let parsed: any
      
      // If response is already an object (from OpenAI service), use it directly
      if (typeof response === 'object' && response !== null) {
        parsed = response
      } else {
        // Otherwise try to parse as JSON
        parsed = JSON.parse(response)
      }
      
      // Transform OpenAI service response to our format
      const aiResponse: AIResponse = {
        message: parsed.message || 'No message provided',
        nextPhase: this.mapPhase(parsed.nextPhase)
      }

      // Handle career suggestions from OpenAI service
      if (parsed.careerSuggestions && Array.isArray(parsed.careerSuggestions)) {
        aiResponse.recommendations = parsed.careerSuggestions
          .filter((suggestion: any) => {
            const careerExists = this.careers.some(career => career.id === suggestion.careerId)
            if (!careerExists) {
              console.warn(`⚠️ Filtered out hallucinated career ID: ${suggestion.careerId}`)
            }
            return careerExists
          })
          .map((suggestion: any) => ({
            careerId: suggestion.careerId,
            name: suggestion.name,
            confidence: suggestion.confidence || 0,
            reasoning: suggestion.reasoning || ''
          }))
      }

      // Handle RIASEC scores
      if (parsed.riasecAssessment?.scores) {
        aiResponse.riasecScores = {
          realistic: parsed.riasecAssessment.scores.R || 0,
          investigative: parsed.riasecAssessment.scores.I || 0,
          artistic: parsed.riasecAssessment.scores.A || 0,
          social: parsed.riasecAssessment.scores.S || 0,
          enterprising: parsed.riasecAssessment.scores.E || 0,
          conventional: parsed.riasecAssessment.scores.C || 0
        }
      }
      
      return aiResponse
      
    } catch (error) {
      console.warn('⚠️ AI response parsing error:', error)
      
      // Return simple message response
      return {
        message: typeof response === 'string' ? response : 'Error processing response',
        nextPhase: currentPhase === 'complete' ? 'complete' : undefined
      }
    }
  }

  private mapPhase(openAIPhase: string): 'exploration' | 'career_matching' | 'reality_check' | 'complete' | undefined {
    switch (openAIPhase) {
      case 'enhanced_exploration':
        return 'exploration'
      case 'career_matching':
        return 'career_matching'
      case 'reality_check':
        return 'reality_check'
      case 'final_results':
      case 'complete':
        return 'complete'
      default:
        return undefined
    }
  }
}