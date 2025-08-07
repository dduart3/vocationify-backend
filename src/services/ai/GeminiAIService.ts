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
- ESTRATEGIA: Exploración integral pero fluida - cada pregunta debe revelar múltiples aspectos RIASEC
- PROGRESIÓN: Saludo → Intereses generales → Habilidades → Valores → Ambiente preferido → Motivaciones → Recomendaciones
- USA CONTEXTO: Conecta respuestas anteriores para hacer preguntas más profundas e inteligentes
- SÉ ESPECÍFICA: Situaciones concretas, proyectos favoritos, forma de abordar problemas, satisfacciones laborales
- MULTI-DIMENSIONAL: Cada pregunta debe explorar 2-3 dimensiones RIASEC simultáneamente
- META: 12-15 intercambios para perfil completo, luego recomendaciones detalladas con reasoning sólido

FASES DETALLADAS:
1. EXPLORACIÓN (4-5 preguntas): Intereses, actividades favoritas, materias que disfruta
2. ASSESSMENT (6-8 preguntas): Habilidades, valores, estilo de trabajo, motivaciones
3. REFINAMIENTO (2-3 preguntas): Clarificaciones específicas, ambiente laboral, prioridades
4. RECOMENDACIÓN: TOP 3 carreras con reasoning detallado y % de compatibilidad

FORMATO DE RESPUESTA (JSON):
{
  "message": "Tu respuesta conversacional aquí",
  "intent": "question|clarification|assessment|recommendation|farewell",
  "suggestedFollowUp": ["pregunta opcional 1", "pregunta opcional 2"],
  "riasecAssessment": {
    "scores": {"R": 0-100, "I": 0-100, "A": 0-100, "S": 0-100, "E": 0-100, "C": 0-100},
    "confidence": 0-100,
    "reasoning": "Por qué estos scores"
  },
  "careerSuggestions": [
    {
      "careerId": "id_de_carrera",
      "name": "Nombre de carrera",
      "confidence": 0-100,
      "reasoning": "Por qué esta carrera"
    }
  ],
  "nextPhase": "exploration|assessment|recommendation|complete"
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
      
      const jsonText = jsonMatch[0];
      console.log('📄 Extracted JSON:', jsonText);
      
      const parsedResponse = JSON.parse(jsonText) as ConversationResponse;
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
      console.error('Gemini AI Error:', error);
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
      console.error('RIASEC Assessment Error:', error);
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
    
    return `Eres ARIA, un asistente de orientación vocacional inteligente y amigable.

PERSONALIDAD:
- Cálido, empático y profesional
- Conversacional, no robótico
- Genuinamente interesado en ayudar
- Adaptas tu comunicación al usuario

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

FASE ACTUAL: ${phase}
USUARIO: ${userName || 'Usuario'}

CARRERAS DISPONIBLES:
${context?.availableCareers?.map(c => `- ${c.name}: ${c.description}`).join('\n') || 'Cargando carreras...'}

CONVERSACIÓN HASTA AHORA:
${context?.userProfile?.previousResponses?.map(r => `P: ${r.question}\nR: ${r.response}`).join('\n\n') || 'Primera interacción'}`;
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