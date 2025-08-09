import { GoogleGenAI } from "@google/genai";
import { AIServiceInterface, ConversationRequest, ConversationResponse, ConversationMessage } from "./AIServiceInterface";

export class GeminiAIService extends AIServiceInterface {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    super();
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generateConversationalResponse(request: ConversationRequest): Promise<ConversationResponse> {
    return this.executeWithRetry(async () => {
      const systemPrompt = this.buildSystemPrompt(request.context);
      const conversationHistory = this.formatMessagesForGemini(request.messages);
      
      const prompt = `${systemPrompt}

HISTORIAL DE CONVERSACIÓN:
${conversationHistory}

INSTRUCCIONES ESPECÍFICAS:
- Responde como ARIA, un asistente de orientación vocacional amigable y conversacional
- OBJETIVO PRINCIPAL: Descubrir perfil vocacional EFICIENTEMENTE para recomendar TOP 3 carreras
- VELOCIDAD: Después de 4-6 intercambios, transiciona a recomendaciones si tienes suficiente información
- ESTRATEGIA: UNA pregunta clara y específica por vez - no múltiples preguntas
- PROGRESIÓN: Saludo → Intereses → Habilidades → Valores → Ambiente → Motivaciones → Recomendaciones  
- USA CONTEXTO: Conecta respuestas anteriores para hacer LA siguiente pregunta más inteligente
- SÉ ESPECÍFICA: Situaciones concretas, pero UNA pregunta a la vez
- ENFOQUE SIMPLE: Cada pregunta explora UN aspecto principal, manténlo conversacional
- META: 5-7 intercambios rápidos, una pregunta por mensaje

FASES DETALLADAS:
1. EXPLORACIÓN (2-3 preguntas): Intereses principales y actividades favoritas
2. ASSESSMENT (2-3 preguntas): Habilidades clave y ambiente de trabajo preferido
3. RECOMENDACIÓN: Analiza CUIDADOSAMENTE los intereses del usuario contra la base de datos de carreras
   - Lee las descripciones de carreras para encontrar las más relevantes
   - Considera tanto RIASEC como la compatibilidad temática
   - Justifica cada recomendación con conexiones específicas a sus intereses
   - IMPORTANTE: Después de dar recomendaciones, SIEMPRE pregunta si quieren saber más
4. EXPLORACIÓN DE CARRERAS: Responder preguntas específicas del usuario sobre las carreras recomendadas
5. FINALIZACIÓN: Cuando usuario confirme estar satisfecho

IMPORTANTE: NUNCA hagas múltiples preguntas en un solo mensaje
CRÍTICO: Cuando des recomendaciones de carreras (intent="recommendation"), SIEMPRE termina tu mensaje con una pregunta como "¿Te gustaría conocer más detalles sobre alguna de estas carreras?" o similar

FORMATO DE RESPUESTA (JSON):
{
  "message": "Tu respuesta conversacional aquí",
  "intent": "question|clarification|assessment|recommendation|completion_check|farewell",
  "suggestedFollowUp": ["pregunta opcional 1", "pregunta opcional 2"],
  "riasecAssessment": {
    "scores": {"R": 0-100, "I": 0-100, "A": 0-100, "S": 0-100, "E": 0-100, "C": 0-100},
    "confidence": 0-100,
    "reasoning": "Por qué estos scores"
  },
  "careerSuggestions": [
    {
      "careerId": "USAR ID EXACTO de las CARRERAS DISPONIBLES listadas arriba",
      "name": "Nombre EXACTO de carrera de la lista",
      "confidence": 0-100,
      "reasoning": "Explica específicamente por qué esta carrera encaja con los intereses, habilidades y valores mencionados por el usuario. Cita palabras/temas específicos de su conversación."
    }
  ],
  "nextPhase": "exploration|assessment|recommendation|career_exploration|complete"
}

Responde SOLO con JSON válido.`;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash-001',
        contents: prompt
      });

      const content = response.text || '';
      console.log('🤖 Raw AI response:', content);
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.log('❌ No JSON found in response, using fallback');
        return this.getFallbackResponse();
      }
      
      let jsonText = jsonMatch[0];
      console.log('📄 Extracted JSON:', jsonText);
      
      // Try to fix common JSON issues
      if (!jsonText.trim().endsWith('}')) {
        console.log('⚠️ JSON appears truncated, attempting to fix...');
        // Find the last complete field and close the JSON
        const lastCompleteField = jsonText.lastIndexOf(',');
        if (lastCompleteField > 0) {
          jsonText = jsonText.substring(0, lastCompleteField) + '}';
          console.log('🔧 Fixed JSON:', jsonText);
        }
      }
      
      let parsedResponse: ConversationResponse;
      try {
        parsedResponse = JSON.parse(jsonText) as ConversationResponse;
      } catch (parseError) {
        console.error('❌ JSON parse error:', parseError);
        console.log('🔧 Attempting to use fallback...');
        return this.getFallbackResponse();
      }
      console.log('✅ Parsed response:', { 
        message: parsedResponse.message?.substring(0, 50) + '...', 
        intent: parsedResponse.intent,
        nextPhase: parsedResponse.nextPhase 
      });
      
      // Ensure nextPhase is set
      if (!parsedResponse.nextPhase) {
        console.log('⚠️ Missing nextPhase, setting to exploration');
        parsedResponse.nextPhase = 'exploration';
      }
      
      return parsedResponse;
    }, 'generateConversationalResponse');
  }

  async assessRiasecFromConversation(messages: ConversationMessage[]): Promise<Record<string, number>> {
    return this.executeWithRetry(async () => {
      const conversationText = messages
        .filter(msg => msg.role === 'user')
        .map(msg => msg.content)
        .join('\n');

      const prompt = `Analiza esta conversación y proporciona scores RIASEC (0-100):

CONVERSACIÓN:
${conversationText}

CRITERIOS RIASEC:
- Realistic (R): Trabajo con herramientas, manos, actividades físicas
- Investigative (I): Investigación, análisis, resolución de problemas
- Artistic (A): Creatividad, expresión artística, originalidad
- Social (S): Ayudar, enseñar, trabajar con personas
- Enterprising (E): Liderazgo, ventas, persuasión
- Conventional (C): Organización, datos, estructuras

Responde SOLO con JSON: {"R": score, "I": score, "A": score, "S": score, "E": score, "C": score}`;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash-001',
        contents: prompt
      });

      const content = response.text || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      return JSON.parse(jsonMatch ? jsonMatch[0] : content);
    }, 'assessRiasecFromConversation', { R: 50, I: 50, A: 50, S: 50, E: 50, C: 50 });
  }

  async generateContextualQuestion(context: ConversationRequest['context']): Promise<string> {
    return this.executeWithRetry(async () => {
      const phase = context?.currentPhase || 'exploration';
      const previousResponses = context?.userProfile?.previousResponses || [];
      
      const prompt = `Genera una pregunta conversacional para orientación vocacional.

CONTEXTO:
- Fase actual: ${phase}
- Respuestas previas: ${previousResponses.length}
- Intereses conocidos: ${context?.userProfile?.interests?.join(', ') || 'ninguno'}

TIPOS DE PREGUNTAS POR FASE:
- exploration: preguntas abiertas sobre intereses, actividades favoritas
- assessment: preguntas específicas para evaluar tipos RIASEC
- recommendation: preguntas para refinar recomendaciones de carrera

Genera UNA pregunta natural y conversacional en español. Responde solo con la pregunta.`;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash-001',
        contents: prompt
      });

      return response.text?.trim() || "¿Qué tipo de actividades disfrutas más?";
    }, 'generateContextualQuestion', "¿Qué tipo de actividades disfrutas más en tu tiempo libre?");
  }

  private buildSystemPrompt(context: ConversationRequest['context']): string {
    const phase = context?.currentPhase || 'greeting';
    const userName = context?.userProfile?.name || '';
    
    let systemPrompt = `Eres ARIA, un asistente de orientación vocacional inteligente y amigable.

PERSONALIDAD:
- Cálido, empático y profesional
- Conversacional, no robótico
- Genuinamente interesado en ayudar
- Adaptas tu comunicación al usuario`;

    if (phase === 'career_exploration') {
      systemPrompt += `

CONTEXTO ACTUAL - EXPLORACIÓN DE CARRERAS:
- El usuario ya completó su evaluación RIASEC y recibió recomendaciones iniciales
- Ahora está explorando carreras de forma interactiva
- Puedes responder preguntas específicas sobre carreras, salarios, trabajo diario, requisitos
- Sugiere alternativas relevantes basadas en su perfil
- Ayúdalo a entender las implicaciones prácticas de cada opción
- IMPORTANTE: USA SOLO las carreras de la lista abajo con sus IDs exactos para recomendaciones
- Si el usuario pregunta por una carrera NO disponible en Maracaibo:
  * Sé HONESTO: "Esa carrera no está disponible en Maracaibo actualmente"
  * Proporciona información general básica sobre esa carrera si la conoces
  * Busca similares en la lista con alta similitud (>80% compatible)
  * Si no hay similares suficientes, explica las diferencias y deja que elija
  * NUNCA fuerces una recomendación que no sea realmente similar

CARRERAS DISPONIBLES EN MARACAIBO:
${context?.availableCareers?.map(c => `- ID: ${c.id} | ${c.name}: ${c.description?.substring(0, 180)} (RIASEC: ${c.riasecCode})`).join('\n') || 'Cargando carreras...'}

OBJETIVO EN ESTA FASE:
- Resolver dudas específicas sobre carreras
- Proporcionar información detallada y práctica
- Sugerir alternativas cuando sea relevante
- Ayudar a tomar una decisión informada

LÓGICA DE FINALIZACIÓN INTELIGENTE:
- Si detectas señales de que el usuario podría estar listo para finalizar:
  * Ha explorado 3+ carreras
  * Hace preguntas más específicas sobre 1-2 carreras
  * Expresa satisfacción o decisión ("creo que ya sé", "me gusta esta opción")
  * Ha estado en esta fase por 5+ intercambios
- ENTONCES usa intent: "completion_check" y pregunta si quiere ver resultados finales
- Proporciona botones: ["Ver resultados finales", "Explorar más carreras"]
- SOLO usa nextPhase: "complete" cuando el usuario confirme explícitamente que quiere terminar
- Si usuario dice "Ver resultados finales" → nextPhase: "complete" inmediatamente
- Si usuario dice "Explorar más carreras" → nextPhase: "career_exploration" y continúa`;
    } else {
      systemPrompt += `

OBJETIVO PRINCIPAL:
- Descubrir qué carrera universitaria le conviene al usuario
- Evaluar tipos RIASEC de manera INTEGRAL pero EFICIENTE
- Hacer 12-15 preguntas estratégicas para obtener un perfil completo
- Cubrir todos los aspectos importantes: intereses, habilidades, valores, ambiente laboral preferido
- Recomendar las 3 mejores carreras con base sólida y reasoning detallado

ASPECTOS A EXPLORAR:
1. Intereses principales y actividades que disfruta
2. Habilidades naturales y talentos
3. Valores personales y motivaciones
4. Ambiente de trabajo preferido (solo vs. equipo, oficina vs. campo, etc.)
5. Nivel de responsabilidad y liderazgo deseado
6. Relación con la tecnología y herramientas
7. Importancia del aspecto económico vs. satisfacción personal

CARRERAS DISPONIBLES EN MARACAIBO (USA IDs EXACTOS):
${context?.availableCareers?.map(c => `- ID: ${c.id} | ${c.name}: ${c.description?.substring(0, 200)} (RIASEC: ${c.riasecCode}, Scores: I:${c.riasecScores?.I || 0} R:${c.riasecScores?.R || 0})`).join('\n') || 'Cargando carreras...'}

PROCESO DE RECOMENDACIÓN:
1. Revisa TODOS los intereses y habilidades mencionados por el usuario
2. Examina las descripciones de carreras para encontrar coincidencias temáticas
3. Considera los scores RIASEC de las carreras vs el perfil del usuario
4. Selecciona las 3 carreras con mayor relevancia combinada (tema + RIASEC)
5. Explica claramente por qué cada carrera encaja con SUS intereses específicos`;
    }

    systemPrompt += `

FASE ACTUAL: ${phase}
USUARIO: ${userName || 'Usuario'}

CONVERSACIÓN HASTA AHORA:
${context?.userProfile?.previousResponses?.map(r => `P: ${r.question}\nR: ${r.response}`).join('\n\n') || 'Primera interacción'}`;

    return systemPrompt;
  }

  private formatMessagesForGemini(messages: ConversationMessage[]): string {
    return messages.map(msg => {
      const role = msg.role === 'assistant' ? 'ARIA' : 'USUARIO';
      return `${role}: ${msg.content}`;
    }).join('\n');
  }

  private getFallbackResponse(): ConversationResponse {
    console.log('🔄 Using fallback response due to AI parsing error');
    return {
      message: "Disculpa, tuve un pequeño problema técnico. Pero sigamos adelante: cuéntame sobre tus intereses. ¿Qué tipo de actividades realmente disfrutas hacer en tu tiempo libre?",
      intent: "question",
      suggestedFollowUp: [
        "¿Prefieres trabajar con tus manos o con ideas?",
        "¿Te gusta resolver problemas complejos?",
        "¿Disfrutas ayudar a otras personas?"
      ],
      nextPhase: "exploration",
      riasecAssessment: {
        scores: { R: 50, I: 50, A: 50, S: 50, E: 50, C: 50 },
        confidence: 20,
        reasoning: 'Respuesta de fallback - sin evaluación aún'
      }
    };
  }

  /**
   * Executes an async function with exponential backoff retry logic
   * Handles Gemini API overload (503) and rate limit errors specifically
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    fallbackValue?: T,
    maxRetries: number = 3,
    baseDelayMs: number = 1000
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Attempt ${attempt}/${maxRetries} for ${operationName}`);
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Check if this is a retryable error
        const isRetryableError = this.isRetryableError(error);
        const isLastAttempt = attempt === maxRetries;

        console.error(`❌ Attempt ${attempt}/${maxRetries} failed for ${operationName}:`, {
          errorType: lastError.name,
          errorMessage: lastError.message,
          isRetryable: isRetryableError,
          isLastAttempt
        });

        // If it's not retryable or last attempt, break
        if (!isRetryableError || isLastAttempt) {
          console.log(`🚫 Not retrying ${operationName} - ${isRetryableError ? 'max attempts reached' : 'non-retryable error'}`);
          break;
        }

        // Calculate exponential backoff delay
        const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 1000; // Add jitter
        console.log(`⏳ Retrying ${operationName} in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`);
        
        await this.sleep(delay);
      }
    }

    // All retries failed, log comprehensive error and return fallback
    console.error(`🔥 All retry attempts failed for ${operationName}. Final error:`, {
      errorType: lastError?.name || 'Unknown',
      errorMessage: lastError?.message || 'Unknown error',
      totalAttempts: maxRetries,
      fallbackAvailable: fallbackValue !== undefined
    });

    // Return fallback value if provided, otherwise throw the last error
    if (fallbackValue !== undefined) {
      console.log(`🔄 Returning fallback value for ${operationName}`);
      return fallbackValue;
    }

    throw lastError || new Error(`Failed after ${maxRetries} attempts`);
  }

  /**
   * Determines if an error should trigger a retry
   */
  private isRetryableError(error: any): boolean {
    const errorMessage = String(error?.message || error || '').toLowerCase();
    const errorStatus = error?.status || error?.response?.status;
    
    // Check for specific retryable conditions
    const isOverloaded = errorMessage.includes('overloaded') || errorStatus === 503;
    const isRateLimit = errorMessage.includes('rate limit') || errorStatus === 429;
    const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT');
    const isNetworkError = errorMessage.includes('network') || errorMessage.includes('ECONNRESET');
    const isInternalError = errorStatus === 500 || errorStatus === 502 || errorStatus === 504;

    const shouldRetry = isOverloaded || isRateLimit || isTimeout || isNetworkError || isInternalError;
    
    if (shouldRetry) {
      console.log(`🔄 Error is retryable:`, {
        isOverloaded,
        isRateLimit, 
        isTimeout,
        isNetworkError,
        isInternalError,
        errorStatus,
        errorMessage: errorMessage.substring(0, 100)
      });
    }

    return shouldRetry;
  }

  /**
   * Helper method to sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}