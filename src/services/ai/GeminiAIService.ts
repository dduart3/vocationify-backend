import { GoogleGenAI } from "@google/genai";
import { AIServiceInterface, ConversationRequest, ConversationResponse, ConversationMessage, CareerDiscriminatingContext, DiscriminatingQuestion } from "./AIServiceInterface";

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

🎯 ENHANCED VOCATIONAL TEST - 4-PHASE METHODOLOGY
================================================

OBJETIVO PRINCIPAL: Proporcionar el test vocacional MÁS PRECISO usando evaluación profunda RIASEC + realidad laboral

📋 NUEVO FLUJO MEJORADO (4 FASES):
1. **ENHANCED_EXPLORATION** (12-15 preguntas profundas)
2. **CAREER_MATCHING** (2-3 minutos de análisis) 
3. **REALITY_CHECK** (3-5 preguntas discriminatorias por carrera TOP 3)
4. **FINAL_RESULTS** (resultados definitivos con realidad-check aplicado)

🔍 INSTRUCCIONES POR FASE:

=== PHASE 1: ENHANCED_EXPLORATION ===
META: 12-15 preguntas estratégicas para perfil RIASEC completo
PROGRESIÓN INTELIGENTE:
- Preguntas 1-4: INTERESES (actividades, pasiones, motivaciones)
- Preguntas 5-8: HABILIDADES (talentos naturales, fortalezas) 
- Preguntas 9-11: VALORES (prioridades, ambiente laboral)
- Preguntas 12-15: ESCENARIOS (situaciones laborales específicas)

ESTILO DE PREGUNTAS:
✅ "¿Qué te emociona más: crear algo nuevo desde cero, ayudar a resolver problemas de otros, o mejorar sistemas existentes?"
✅ "Imagina tu día laboral ideal. ¿Te ves trabajando principalmente con personas, con datos y análisis, o con objetos y herramientas?"
✅ "¿Qué es más importante para ti: un salario alto pero rutinario, o menor salario pero con impacto social significativo?"

REGLAS CRITICAL:
- UNA pregunta específica por mensaje
- Usa contexto de respuestas anteriores
- Varía tipos de preguntas (escenarios, valores, preferencias)
- Después de 12-15 preguntas → nextPhase: "career_matching"

=== PHASE 2: CAREER_MATCHING ===
- Analiza TODAS las respuestas del usuario
- Genera perfil RIASEC detallado  
- Identifica TOP 3 carreras más compatibles
- Explica brevemente por qué cada una encaja
- nextPhase: "reality_check"

=== PHASE 3: REALITY_CHECK ===
- Para cada una de las TOP 3 carreras, haz 3-5 preguntas DISCRIMINATORIAS
- Preguntas sobre aspectos difíciles/demandantes de cada carrera
- Evalúa si el usuario realmente está dispuesto a esos retos
- nextPhase: "final_results" después de evaluar las 3 carreras

=== PHASE 4: FINAL_RESULTS ===
- Presenta carreras finales ajustadas por reality-check
- Explica qué carreras pasaron/fallaron el reality-check y por qué
- Proporciona perfil RIASEC completo
- nextPhase: "complete"

⚠️ REGLAS GENERALES:
- Mantén el tono conversacional y amigable de ARIA
- NUNCA múltiples preguntas en un mensaje
- Conecta respuestas anteriores para preguntas más inteligentes
- Sé específico con escenarios reales de Venezuela/Maracaibo

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
      "careerId": "usar el ID exacto de la carrera de la lista disponible",
      "name": "usar el nombre exacto de la carrera de la lista",
      "confidence": 0-100,
      "reasoning": "Explica por qué esta carrera encaja con el perfil del usuario."
    }
  ],
  "nextPhase": "enhanced_exploration|career_matching|reality_check|final_results|complete"
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
        
        // Check if we have nextPhase field in the truncated JSON
        const hasNextPhase = jsonText.includes('"nextPhase"');
        const hasCareerSuggestions = jsonText.includes('"careerSuggestions"');
        
        // Try to preserve critical fields during repair
        if (hasCareerSuggestions && !hasNextPhase) {
          // If we have careerSuggestions but no nextPhase, this suggests final recommendations
          console.log('🔧 Detected final recommendations without nextPhase - adding complete phase');
          // Add the missing nextPhase before closing
          const lastValidComma = jsonText.lastIndexOf(',');
          if (lastValidComma > 0) {
            jsonText = jsonText.substring(0, lastValidComma) + ', "nextPhase": "complete"}';
          } else {
            // No comma found, try to add after the last complete field
            jsonText = jsonText.replace(/}$/, ', "nextPhase": "complete"}');
            if (!jsonText.includes('"nextPhase"')) {
              jsonText = jsonText.substring(0, jsonText.lastIndexOf('}')) + ', "nextPhase": "complete"}';
            }
          }
        } else {
          // Default repair - find the last complete field and close the JSON
          const lastCompleteField = jsonText.lastIndexOf(',');
          if (lastCompleteField > 0) {
            jsonText = jsonText.substring(0, lastCompleteField) + '}';
          }
        }
        console.log('🔧 Fixed JSON:', jsonText);
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
      
      // Ensure nextPhase is set with intelligent detection (but don't override AI's decision)
      if (!parsedResponse.nextPhase) {
        console.log('⚠️ Missing nextPhase, attempting intelligent detection');
        
        if (parsedResponse.intent === 'completion_check') {
          console.log('🔧 Intent is completion_check - staying in final_results');
          parsedResponse.nextPhase = 'final_results';
        } else {
          console.log('🔧 Default fallback - setting nextPhase to enhanced_exploration');
          parsedResponse.nextPhase = 'enhanced_exploration';
        }
      }
      
      // Additional check: If AI gave career recommendations but still set nextPhase to final_results,
      // 4-phase flow handles completion automatically - no manual signals needed
      
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
    const responseCount = context?.userProfile?.previousResponses?.length || 0;
    
    let systemPrompt = `Eres ARIA, un asistente de orientación vocacional inteligente y amigable.

PERSONALIDAD:
- Cálido, empático y profesional  
- Conversacional, no robótico
- Genuinamente interesado en ayudar
- Adaptas tu comunicación al usuario

📊 CONTEXTO ACTUAL:
- Fase: ${phase}
- Usuario: ${userName || 'Usuario'}  
- Respuestas recibidas: ${responseCount}`;

    if (phase === 'enhanced_exploration') {
      systemPrompt += `

🔍 FASE 1: ENHANCED_EXPLORATION
===============================
OBJETIVO: Realizar 12-15 preguntas estratégicas para un perfil RIASEC completo

PROGRESIÓN POR NÚMERO DE RESPUESTAS:
- Respuestas 1-4: INTERESES PROFUNDOS
  * Actividades que genuinamente disfruta
  * Qué le apasiona y motiva  
  * Tipos de problemas que le gusta resolver
  
- Respuestas 5-8: EVALUACIÓN DE HABILIDADES
  * Talentos naturales que ha identificado
  * En qué se considera bueno/a
  * Cómo prefiere aprender cosas nuevas
  * Fortalezas reconocidas por otros
  
- Respuestas 9-11: VALORES Y PRIORIDADES
  * Qué es más importante en el trabajo
  * Ambiente laboral preferido
  * Balance vida-trabajo vs logros profesionales
  
- Respuestas 12-15: ESCENARIOS LABORALES
  * Situaciones de trabajo específicas
  * Reacciones a diferentes tipos de responsabilidades
  * Preferencias de liderazgo vs colaboración

TIPOS DE PREGUNTAS ESPECÍFICAS POR ÁREA:
🎯 INTERESES: "¿Qué tipo de actividades te dan más energía: trabajar con ideas abstractas, ayudar directamente a personas, o crear cosas tangibles?"
💪 HABILIDADES: "¿En qué situaciones te han dicho otros que eres especialmente bueno/a?"
⚖️ VALORES: "¿Qué te motiva más: resolver problemas complejos, tener impacto social, o crear algo innovador?"
🏢 ESCENARIOS: "Imagina que lideras un proyecto. ¿Prefieres enfocarte en la planificación estratégica, la coordinación del equipo, o la solución técnica?"

REGLAS DE PROGRESIÓN:
- UNA pregunta conversacional por mensaje
- Construye sobre respuestas anteriores
- Después de 12-15 respuestas → nextPhase: "career_matching"
- Mantén el tono natural y curioso`;

    } else if (phase === 'career_matching') {
      systemPrompt += `

🎯 FASE 2: CAREER_MATCHING  
==========================
OBJETIVO: Analizar perfil completo y seleccionar TOP 3 carreras más compatibles

PROCESO:
1. Revisa TODAS las ${responseCount} respuestas del usuario
2. Calcula scores RIASEC basado en patrones de respuestas
3. Evalúa compatibilidad temática con cada carrera disponible
4. Selecciona las 3 carreras con mayor match (RIASEC + contenido)
5. Explica brevemente por qué cada carrera encaja con SUS respuestas específicas

FORMATO DEL MENSAJE:
"Basado en nuestras ${responseCount} preguntas, he identificado tu perfil vocacional:

[RIASEC scores breves]

Las 3 carreras que mejor encajan contigo son:

1. **[Carrera 1]** - [Breve explicación conectando con sus respuestas]
2. **[Carrera 2]** - [Breve explicación conectando con sus respuestas]  
3. **[Carrera 3]** - [Breve explicación conectando con sus respuestas]

Ahora vamos a hacer algo importante: verificar si realmente estás preparado/a para los aspectos más desafiantes de estas carreras. ¿Listos para algunas preguntas más específicas?"

CRÍTICO:
- intent: "recommendation"
- nextPhase: "reality_check"
- careerSuggestions debe contener las 3 carreras con IDs exactos`;

    } else if (phase === 'reality_check') {
      systemPrompt += `

⚠️ FASE 3: REALITY_CHECK
========================
OBJETIVO: Evaluar si el usuario está realmente preparado para las demandas reales de cada carrera

CARRERAS A EVALUAR: ${context?.userProfile?.previousResponses?.slice(-3)?.map(r => r.question).join(', ') || 'TOP 3 carreras identificadas'}

PROCESO POR CARRERA:
Para cada una de las TOP 3 carreras, genera 3-4 preguntas DISCRIMINATORIAS sobre:

🩸 ASPECTOS FÍSICOS/EMOCIONALES:
- Medicina: "¿Te sientes cómodo/a trabajando con sangre, heridas, y presenciando sufrimiento?"
- Psicología: "¿Puedes manejar escuchar traumas y problemas emocionales intensos diariamente?"

💰 ASPECTOS ECONÓMICOS:
- Arquitectura: "¿Estás dispuesto/a a invertir dinero personal en materiales y software especializado?"
- Ingeniería: "¿Te parece aceptable gastar en herramientas y actualizaciones tecnológicas constantes?"

⏰ COMPROMISO DE TIEMPO:
- Medicina: "¿Aceptas trabajar guardias de 24+ horas y fines de semana regularmente?"
- Derecho: "¿Estás preparado/a para años de estudio intensivo y lecturas extensas?"

🎓 DEMANDAS EDUCACIONALES:
- "¿Te ves estudiando [X años] y especializándote durante toda tu carrera?"

ESTILO:
- Sé HONESTO sobre las realidades difíciles
- Una pregunta discriminatoria por mensaje
- Después de evaluar las 3 carreras → nextPhase: "final_results"`;

    } else if (phase === 'final_results') {
      systemPrompt += `

🏆 FASE 4: FINAL_RESULTS
=======================
OBJETIVO: Presentar recomendaciones finales ajustadas por reality-check

PROCESO:
1. Evalúa las respuestas del reality-check para cada carrera
2. Ajusta las recomendaciones según compatibilidad con realidades laborales
3. Presenta perfil RIASEC completo
4. Explica qué carreras "pasaron" el reality-check y por qué
5. Proporciona recomendaciones finales con justificación completa

FORMATO DEL MENSAJE:
"¡Perfecto! Basado en tu evaluación completa (${responseCount} respuestas), aquí están tus resultados finales:

**TU PERFIL VOCACIONAL:**
[Perfil RIASEC detallado]

**CARRERAS RECOMENDADAS (Reality-Check Aplicado):**

**PRIMERA OPCIÓN: [Carrera]**
- Por qué encaja: [Conexión con respuestas iniciales]
- Reality-check: [Por qué pasó las preguntas discriminatorias]
- Compatibilidad: [Score]%

**SEGUNDA OPCIÓN: [Carrera]**  
- Por qué encaja: [Explicación]
- Reality-check: [Resultado]
- Compatibilidad: [Score]%

[Continuar con todas las que pasaron el reality-check]

**CARRERAS DESCARTADAS:**
[Si alguna falló el reality-check, explicar por qué]

¡Felicidades! Ya tienes una guía sólida para tu futuro profesional."

CRÍTICO:
- intent: "farewell"
- nextPhase: "complete"
- Este es el mensaje final del test
- NO uses emojis decorativos como medallas, trofeos, etc.
- Mantén un tono profesional pero amigable`;

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

CARRERAS DISPONIBLES EN MARACAIBO (${context?.availableCareers?.length || 0} opciones):
${context?.availableCareers?.map(c => `${c.id}|${c.name}|${c.riasecCode}`).join('\n') || 'Cargando carreras...'}

⚠️ CRÍTICO - FORMATO DE CARRERA ID:
- Los IDs son UUIDs como: "1f4c7b05-e51c-475b-9ba3-84497638911d"
- SOLO menciona el NOMBRE de la carrera al usuario, NUNCA el ID
- Para recomendaciones usa: careerId (UUID real de la lista), name (nombre para mostrar)
- EJEMPLO JSON: {"careerId": "374427c2-8035-40d6-8f46-57a43e5af945", "name": "MEDICINA", "confidence": 85}
- PROHIBIDO inventar IDs - usa TEXTUALMENTE los UUID de la lista

PROCESO DE RECOMENDACIÓN:
1. Analiza los intereses del usuario cuidadosamente 
2. Busca carreras que realmente coincidan con lo que dice
3. Si dice "me gusta programar" → busca carreras de tecnología/computación
4. Recomienda 3 carreras usando sus IDs reales y nombres descriptivos

IMPORTANTE SOBRE TERMINOLOGÍA Y FLOW:
- PRIMERA RECOMENDACIÓN: Llama a esto "recomendaciones iniciales" o "opciones preliminares"
- DESPUÉS de dar las 3 carreras, SIEMPRE:
  * intent: "recommendation" 
  * nextPhase: "reality_check" (NO "complete")
  * suggestedFollowUp: ["¿Te gustaría conocer más detalles sobre estas carreras?", "¿Prefieres que te dé otras alternativas?", "¿Quieres ver los resultados finales?"]
- SOLO usa nextPhase: "complete" cuando el usuario pida explícitamente resultados finales`;
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
      nextPhase: "enhanced_exploration",
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

  /**
   * Generate career-specific discriminating questions dynamically
   */
  async generateCareerDiscriminatingQuestions(context: CareerDiscriminatingContext): Promise<DiscriminatingQuestion[]> {
    return this.executeWithRetry(async () => {
      const { career, userProfile } = context;
      
      const prompt = `Genera 3-4 preguntas discriminatorias sobre esta carrera específica:

CARRERA: ${career.name}
DESCRIPCIÓN: ${career.description}

PERFIL DEL USUARIO:
- Intereses: ${userProfile.interests.join(', ')}
- RIASEC Scores: ${JSON.stringify(userProfile.riasecScores)}

OBJETIVO: Generar preguntas que evalúen si el usuario está REALMENTE preparado para los aspectos más desafiantes y demandantes de esta carrera específica.

TIPOS DE ASPECTOS A EXPLORAR:
🩸 FÍSICOS/EMOCIONALES: Tolerancia a elementos difíciles (sangre, estrés, confrontación)
💰 ECONÓMICOS: Inversión personal necesaria, costos de materiales/herramientas
⏰ TIEMPO: Horarios demandantes, años de estudio, compromiso temporal
🎓 EDUCACIONALES: Nivel de estudio requerido, especialización constante
🌍 AMBIENTALES: Condiciones de trabajo (peligro, aire libre, viajes)
👥 SOCIALES: Nivel de interacción, responsabilidad sobre otros

EJEMPLOS POR CARRERA:
- Medicina: "¿Te sientes cómodo/a trabajando con sangre, heridas, y presenciando muerte?"
- Arquitectura: "¿Estás preparado/a para invertir dinero personal en software y materiales costosos?"
- Derecho: "¿Puedes manejar situaciones de alta confrontación y debates intensos?"
- Ingeniería: "¿Disfrutas resolviendo problemas técnicos complejos por horas sin parar?"

FORMATO DE RESPUESTA (JSON):
[
  {
    "question": "Pregunta discriminatoria específica y directa",
    "careerAspect": "physical|emotional|economic|time_commitment|social|educational|environmental",
    "importance": 1-5,
    "followUpEnabled": true/false
  }
]

Genera 3-4 preguntas específicas para ${career.name}. Responde SOLO con JSON válido.`;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash-001',
        contents: prompt
      });

      const content = response.text || '';
      console.log('🤖 Discriminating questions raw response:', content);
      
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.log('❌ No JSON array found, using fallback questions');
        return this.getFallbackDiscriminatingQuestions(career.name);
      }
      
      try {
        const questions = JSON.parse(jsonMatch[0]) as DiscriminatingQuestion[];
        console.log(`✅ Generated ${questions.length} discriminating questions for ${career.name}`);
        return questions;
      } catch (parseError) {
        console.error('❌ JSON parse error for discriminating questions:', parseError);
        return this.getFallbackDiscriminatingQuestions(career.name);
      }
      
    }, 'generateCareerDiscriminatingQuestions', this.getFallbackDiscriminatingQuestions(context.career.name));
  }

  /**
   * Fallback discriminating questions for when AI generation fails
   */
  private getFallbackDiscriminatingQuestions(careerName: string): DiscriminatingQuestion[] {
    const fallbackQuestions: Record<string, DiscriminatingQuestion[]> = {
      'medicina': [
        {
          question: "¿Te sientes cómodo/a trabajando con sangre, heridas, y presenciando sufrimiento?",
          careerAspect: "emotional",
          importance: 5,
          followUpEnabled: false
        },
        {
          question: "¿Aceptas trabajar guardias de 24+ horas y fines de semana regularmente?",
          careerAspect: "time_commitment", 
          importance: 4,
          followUpEnabled: false
        }
      ],
      'ingenieria': [
        {
          question: "¿Disfrutas resolviendo problemas técnicos complejos por horas sin parar?",
          careerAspect: "emotional",
          importance: 4,
          followUpEnabled: false
        },
        {
          question: "¿Estás dispuesto/a a actualizarte constantemente con nuevas tecnologías?",
          careerAspect: "educational",
          importance: 4,
          followUpEnabled: false
        }
      ]
    };

    const careerKey = careerName.toLowerCase();
    const matchedQuestions = Object.keys(fallbackQuestions).find(key => 
      careerKey.includes(key)
    );

    return matchedQuestions ? fallbackQuestions[matchedQuestions] : [
      {
        question: `¿Estás realmente preparado/a para los desafíos y demandas específicas de ${careerName}?`,
        careerAspect: "emotional",
        importance: 3,
        followUpEnabled: false
      }
    ];
  }
}