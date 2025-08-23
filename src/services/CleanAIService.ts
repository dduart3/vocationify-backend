// Clean AI Service - No complex logic, bulletproof prompts
// Prevents career ID hallucination by using real database careers only

import { supabase } from '../config/database'

interface AIResponse {
  message: string
  nextPhase?: 'exploration' | 'career_matching' | 'reality_check' | 'complete'
  readyToComplete?: boolean
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
1. Si recibes el mensaje "INICIO_SESION", responde EXACTAMENTE con el mensaje inicial completo
2. Haz preguntas abiertas y conversacionales sobre intereses, materias favoritas, actividades que disfrutan
3. NUNCA menciones carreras específicas o hagas recomendaciones en esta fase
4. NUNCA hagas referencia a la lista de carreras que tienes
5. Enfócate en conocer al estudiante como persona
6. Usa lenguaje natural y amigable apropiado para adolescentes
7. Después de 15+ intercambios significativos, indica nextPhase: "career_matching"

⚠️ CRUCIAL: Si el mensaje es "INICIO_SESION", debes responder con EXACTAMENTE este mensaje completo (no lo resumas):

"¡Hola! Soy ARIA, tu asistente y consejera vocacional especializada en Maracaibo. Estoy aquí para ayudarte a descubrir qué carrera universitaria podría ser perfecta para ti.

Mi trabajo es conocerte a fondo a través de una conversación natural y amigable. Te haré varias preguntas sobre tus intereses, las materias que más te gustan, las actividades que disfrutas y tu personalidad. No te preocupes, no hay respuestas correctas o incorrectas - solo quiero entender quién eres realmente.

Al final de nuestra charla, te daré recomendaciones personalizadas de carreras que se adapten perfectamente a tu perfil, y después haremos un pequeño 'reality check' para asegurarnos de que realmente te sientes identificado con esas opciones.

¿Estás listo para comenzar? Para empezar, cuéntame: ¿qué materias en el colegio realmente disfrutas y te emocionan?"

NO IGNORES ESTA INSTRUCCIÓN. NO HAGAS EL MENSAJE MÁS CORTO.

PREGUNTAS POSTERIORES: Haz preguntas naturales y conversacionales basadas en las respuestas anteriores.

FORMATO DE RESPUESTA:
{
  "message": "tu presentación inicial o pregunta aquí",
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
OBJETIVO: Hacer exactamente 5 preguntas discriminantes para validar las recomendaciones.

🚨 CONTADOR DE PREGUNTAS - SEGUIR ESTRICTAMENTE:
- Pregunta 1: Primera pregunta discriminante
- Pregunta 2: Segunda pregunta discriminante  
- Pregunta 3: Tercera pregunta discriminante
- Pregunta 4: Cuarta pregunta discriminante
- Pregunta 5: Quinta pregunta discriminante
- Respuesta 6: COMPLETAR CON RECOMENDACIONES - nextPhase: "complete"

INSTRUCCIONES ABSOLUTAS:
1. Si recibes "INICIAR_REALITY_CHECK", responde con PREGUNTA 1
2. Haz preguntas específicas sobre situaciones reales de las carreras recomendadas
3. NUNCA menciones carreras por nombre, haz preguntas situacionales
4. Ejemplos: "¿Te emocionaría pasar horas resolviendo problemas complejos?"
5. ⚠️ CRÍTICO: CUENTA las preguntas que has hecho. Después de 5 preguntas respondidas, COMPLETA
6. Durante preguntas 1-5: nextPhase: null, careerSuggestions: []
7. En respuesta 6: nextPhase: "complete", incluir careerSuggestions
8. ⚠️ NUNCA HAGAS MÁS DE 5 PREGUNTAS - ESTO ES OBLIGATORIO

FORMATO DE RESPUESTA:
Para preguntas 1-4:
{
  "message": "tu pregunta discriminante aquí",
  "nextPhase": null,
  "careerSuggestions": []
}

Para tu 6ta respuesta (FINAL - después de que usuario responda 5 preguntas):
{
  "message": "¡Perfecto! Con tus respuestas ya tengo toda la información necesaria. Aquí están mis recomendaciones finales basadas en tu perfil:",
  "nextPhase": "complete", 
  "careerSuggestions": [array de recomendaciones finales]
}

⚠️ CRUCIAL: Si el mensaje es "INICIAR_REALITY_CHECK", haz tu primera pregunta discriminante y SIEMPRE pon nextPhase: null
`
  }

  private getCompletePrompt(careersContext: string): string {
    return `
Eres ARIA, un consejero vocacional experto para estudiantes de bachillerato en Venezuela.

CONTEXTO INTERNO (solo para ti, el usuario NO sabe esto):
${careersContext}

FASE ACTUAL: COMPLETADO
OBJETIVO: Proporcionar mensaje final con recomendaciones después del reality check.

INSTRUCCIONES ABSOLUTAS:
1. Si recibes "COMPLETAR_REALITY_CHECK", proporciona un mensaje final inspirador
2. Incluye las 3-5 mejores recomendaciones de carreras basadas en toda la conversación
3. USA ÚNICAMENTE LOS IDs de carreras de la lista anterior
4. PROHIBIDO ABSOLUTO crear o inventar IDs de carreras
5. El mensaje debe ser motivador y explicar que el reality check confirmó la compatibilidad

FORMATO DE RESPUESTA:
{
  "message": "¡Excelente! Has completado exitosamente tu evaluación vocacional. Basado en nuestras conversaciones y el reality check, estas carreras son perfectas para ti:",
  "careerSuggestions": [
    {
      "careerId": "ID_EXACTO_DE_LA_LISTA",
      "name": "NOMBRE_EXACTO_DE_LA_LISTA",
      "confidence": 90,
      "reasoning": "explicación final de por qué encaja"
    }
  ],
  "riasecScores": {
    "realistic": 20,
    "investigative": 85,
    "artistic": 40,
    "social": 70,
    "enterprising": 45,
    "conventional": 75
  }
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
        nextPhase: this.mapPhase(parsed.nextPhase),
        readyToComplete: parsed.readyToComplete || false
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