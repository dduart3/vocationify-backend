import { GoogleGenAI } from "@google/genai";
import { AIServiceInterface, ConversationRequest, ConversationResponse, ConversationMessage } from "./AIServiceInterface";

export class GeminiAIService extends AIServiceInterface {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    super();
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generateConversationalResponse(request: ConversationRequest): Promise<ConversationResponse> {
    const systemPrompt = this.buildSystemPrompt(request.context);
    const conversationHistory = this.formatMessagesForGemini(request.messages);
    
    const prompt = `${systemPrompt}

HISTORIAL DE CONVERSACIÓN:
${conversationHistory}

INSTRUCCIONES ESPECÍFICAS:
- Responde como ARIA, un asistente de orientación vocacional amigable y conversacional
- OBJETIVO PRINCIPAL: Descubrir perfil vocacional COMPLETO para recomendar TOP 3 carreras con alta confianza
- ESTRATEGIA: UNA pregunta clara y específica por vez - no múltiples preguntas
- PROGRESIÓN: Saludo → Intereses → Habilidades → Valores → Ambiente → Motivaciones → Recomendaciones  
- USA CONTEXTO: Conecta respuestas anteriores para hacer LA siguiente pregunta más inteligente
- SÉ ESPECÍFICA: Situaciones concretas, pero UNA pregunta a la vez
- ENFOQUE SIMPLE: Cada pregunta explora UN aspecto principal, manténlo conversacional
- META: 8-12 intercambios eficientes, una pregunta por mensaje

FASES DETALLADAS:
1. EXPLORACIÓN (3-4 preguntas): UNA pregunta sobre intereses, luego actividades favoritas, materias
2. ASSESSMENT (4-5 preguntas): UNA pregunta sobre habilidades, luego valores, ambiente de trabajo
3. RECOMENDACIÓN: Analiza CUIDADOSAMENTE los intereses del usuario contra la base de datos de carreras
   - Lee las descripciones de carreras para encontrar las más relevantes
   - Considera tanto RIASEC como la compatibilidad temática
   - Justifica cada recomendación con conexiones específicas a sus intereses
4. EXPLORACIÓN DE CARRERAS: Responder preguntas específicas del usuario
5. FINALIZACIÓN: Cuando usuario confirme

IMPORTANTE: NUNCA hagas múltiples preguntas en un solo mensaje

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

    try {
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
    } catch (error) {
      console.error('❌ Gemini AI Service Error:', error);
      console.error('📋 Error details:', {
        model: 'gemini-2.0-flash-001',
        messageCount: request.messages.length,
        currentPhase: request.context?.currentPhase,
        errorType: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      console.log('🔄 Returning fallback response due to Gemini API failure');
      return this.getFallbackResponse();
    }
  }

  async assessRiasecFromConversation(messages: ConversationMessage[]): Promise<Record<string, number>> {
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

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash-001',
        contents: prompt
      });

      const content = response.text || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      return JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch (error) {
      console.error('❌ Gemini RIASEC Assessment Error:', error);
      console.error('📋 Assessment context:', {
        conversationLength: conversationText.length,
        messageCount: messages.length,
        errorType: error instanceof Error ? error.name : typeof error
      });
      console.log('🔄 Using default RIASEC scores due to assessment failure');
      return { R: 50, I: 50, A: 50, S: 50, E: 50, C: 50 };
    }
  }

  async generateContextualQuestion(context: ConversationRequest['context']): Promise<string> {
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

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash-001',
        contents: prompt
      });

      return response.text?.trim() || "¿Qué tipo de actividades disfrutas más?";
    } catch (error) {
      console.error('Question Generation Error:', error);
      return "¿Qué tipo de actividades disfrutas más en tu tiempo libre?";
    }
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
}