import OpenAI from "openai";
import { AIServiceInterface, ConversationRequest, ConversationResponse, ConversationMessage, CareerDiscriminatingContext, DiscriminatingQuestion } from "./AIServiceInterface";

export class OpenAIService extends AIServiceInterface {
  private openai: OpenAI;

  constructor(apiKey: string) {
    super();
    this.openai = new OpenAI({ apiKey });
  }

  async generateConversationalResponse(request: ConversationRequest): Promise<ConversationResponse> {
    const systemPrompt = this.buildSystemPrompt(request.context);
    
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...request.messages.map(msg => ({
        role: msg.role as "system" | "user" | "assistant",
        content: msg.content
      }))
    ];

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-5-mini",
        messages,
        temperature: 0.7,
        max_tokens: 1000,
        response_format: { type: "json_object" }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from OpenAI");
      }

      console.log('🤖 Raw OpenAI response:', content);
      
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.log('❌ No JSON found in OpenAI response, using fallback');
        return this.getFallbackResponse();
      }
      
      let jsonText = jsonMatch[0];
      console.log('📄 Extracted JSON:', jsonText);
      
      // Handle truncated JSON responses
      if (!jsonText.trim().endsWith('}')) {
        console.log('⚠️ OpenAI JSON appears truncated, attempting to fix...');
        
        const hasNextPhase = jsonText.includes('"nextPhase"');
        const hasCareerSuggestions = jsonText.includes('"careerSuggestions"');
        
        if (hasCareerSuggestions && !hasNextPhase) {
          console.log('🔧 Detected final recommendations without nextPhase - adding complete phase');
          const lastValidComma = jsonText.lastIndexOf(',');
          if (lastValidComma > 0) {
            jsonText = jsonText.substring(0, lastValidComma) + ', "nextPhase": "complete"}';
          } else {
            jsonText = jsonText.substring(0, jsonText.lastIndexOf('}')) + ', "nextPhase": "complete"}';
          }
        } else {
          const lastCompleteField = jsonText.lastIndexOf(',');
          if (lastCompleteField > 0) {
            jsonText = jsonText.substring(0, lastCompleteField) + '}';
          }
        }
        console.log('🔧 Fixed OpenAI JSON:', jsonText);
      }
      
      let parsedResponse: ConversationResponse;
      try {
        parsedResponse = JSON.parse(jsonText) as ConversationResponse;
      } catch (parseError) {
        console.error('❌ OpenAI JSON parse error:', parseError);
        return this.getFallbackResponse();
      }
      
      // Ensure nextPhase is set with intelligent detection (but don't override AI's decision)
      if (!parsedResponse.nextPhase) {
        console.log('⚠️ Missing nextPhase in OpenAI response, attempting intelligent detection');
        
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
    } catch (error) {
      console.error('❌ OpenAI Service Error:', error);
      console.error('📋 Error details:', {
        model: 'gpt-4',
        messageCount: messages.length,
        errorType: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      console.log('🔄 Returning fallback response due to OpenAI API failure');
      return this.getFallbackResponse();
    }
  }

  async assessRiasecFromConversation(messages: ConversationMessage[]): Promise<Record<string, number>> {
    const conversationText = messages
      .filter(msg => msg.role === 'user')
      .map(msg => msg.content)
      .join('\n');

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: `Analiza esta conversación y proporciona scores RIASEC (0-100 para cada tipo):
- Realistic (R): Trabajo con herramientas, manos, actividades físicas
- Investigative (I): Investigación, análisis, resolución de problemas
- Artistic (A): Creatividad, expresión artística, originalidad
- Social (S): Ayudar, enseñar, trabajar con personas
- Enterprising (E): Liderazgo, ventas, persuasión
- Conventional (C): Organización, datos, estructuras

Responde SOLO con JSON válido.`
          },
          {
            role: "user",
            content: conversationText
          }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }
      });

      const content = response.choices[0]?.message?.content;
      return JSON.parse(content || '{"R": 50, "I": 50, "A": 50, "S": 50, "E": 50, "C": 50}');
    } catch (error) {
      console.error('❌ OpenAI RIASEC Assessment Error:', error);
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
    const phase = context?.currentPhase || 'enhanced_exploration';
    const previousResponses = context?.userProfile?.previousResponses || [];
    
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: `Eres ARIA, asistente de orientación vocacional. Genera UNA pregunta conversacional natural.

CONTEXTO:
- Fase: ${phase}
- Respuestas previas: ${previousResponses.length}
- Intereses: ${context?.userProfile?.interests?.join(', ') || 'ninguno'}

TIPOS POR FASE:
- enhanced_exploration: preguntas profundas estratégicas sobre intereses, habilidades, valores
- career_matching: análisis de compatibilidad de carreras
- reality_check: preguntas discriminatorias sobre aspectos desafiantes
- final_results: compilación de resultados finales

Responde solo con la pregunta en español.`
          }
        ],
        temperature: 0.7,
        max_tokens: 100
      });

      return response.choices[0]?.message?.content?.trim() || "¿Qué actividades te emocionan más?";
    } catch (error) {
      console.error('❌ OpenAI Question Generation Error:', error);
      console.error('📋 Question context:', {
        phase: context?.currentPhase,
        errorType: error instanceof Error ? error.name : typeof error
      });
      console.log('🔄 Using fallback question due to generation failure');
      return "¿Qué tipo de actividades disfrutas más?";
    }
  }

  private buildSystemPrompt(context: ConversationRequest['context']): string {
    const phase = context?.currentPhase || 'greeting';
    const userName = context?.userProfile?.name || '';
    
    let systemPrompt = `Eres ARIA, un asistente de orientación vocacional inteligente y conversacional.

PERSONALIDAD: Cálido, empático, profesional, natural (no robótico)`;

    // Updated for 4-phase methodology
      systemPrompt += `

OBJETIVO: Descubrir perfil vocacional RÁPIDAMENTE y recomendar carreras MUY RELEVANTES.

REGLAS:
- UNA pregunta por mensaje, nunca múltiples
- EFICIENCIA: Después de 4-6 intercambios, procede a recomendaciones
- Solo hace preguntas esenciales: intereses principales, habilidades, ambiente de trabajo
- Analiza cuidadosamente las descripciones de carreras vs intereses del usuario

CARRERAS DISPONIBLES EN MARACAIBO (${context?.availableCareers?.length || 0} opciones):
${context?.availableCareers?.map(c => `${c.id}|${c.name}|${c.riasecCode}`).join('\n') || 'Cargando...'}

⚠️ CRÍTICO - FORMATO DE CARRERA ID:
- Los IDs son UUIDs como: "1f4c7b05-e51c-475b-9ba3-84497638911d"
- SOLO menciona el NOMBRE de la carrera al usuario, NUNCA el ID  
- Para recomendaciones usa: careerId (UUID real de la lista), name (nombre para mostrar)
- EJEMPLO JSON: {"careerId": "374427c2-8035-40d6-8f46-57a43e5af945", "name": "MEDICINA", "confidence": 85}
- PROHIBIDO inventar IDs - usa TEXTUALMENTE los UUID de la lista

🎯 ENHANCED 4-PHASE METHODOLOGY:
1. ENHANCED_EXPLORATION: 12-15 preguntas estratégicas profundas
2. CAREER_MATCHING: Análisis completo + top 3 carreras  
3. REALITY_CHECK: Preguntas discriminatorias sobre aspectos desafiantes
4. FINAL_RESULTS: Resultados finales ajustados por reality check

IMPORTANTE SOBRE TERMINOLOGÍA Y FLOW:
- PRIMERA RECOMENDACIÓN: Llama a esto "recomendaciones iniciales" o "top 3 carreras"
- DESPUÉS de dar las 3 carreras, SIEMPRE:
  * intent: "recommendation" 
  * nextPhase: "reality_check" (NO "complete")
  * suggestedFollowUp: ["¿Estás listo/a para evaluar las realidades de estas carreras?", "¿Quieres saber sobre los aspectos desafiantes?"]
- SOLO usa nextPhase: "complete" cuando el usuario complete el reality check`;

    systemPrompt += `

FASE ACTUAL: ${phase}
USUARIO: ${userName || 'Usuario'}

Responde SIEMPRE en formato JSON con esta estructura:
{
  "message": "respuesta conversacional",
  "intent": "question|clarification|assessment|recommendation|completion_check|farewell",
  "suggestedFollowUp": ["pregunta1", "pregunta2"],
  "riasecAssessment": {
    "scores": {"R": 0-100, "I": 0-100, "A": 0-100, "S": 0-100, "E": 0-100, "C": 0-100},
    "confidence": 0-100,
    "reasoning": "explicación"
  },
  "careerSuggestions": [{"careerId": "usar ID exacto de la lista de carreras", "name": "usar nombre exacto de la lista", "confidence": 0-100, "reasoning": "por qué encaja con perfil"}],
  "nextPhase": "enhanced_exploration|career_matching|reality_check|final_results|complete"
}`;

    return systemPrompt;
  }

  async generateCareerDiscriminatingQuestions(context: CareerDiscriminatingContext): Promise<DiscriminatingQuestion[]> {
    const { career, userProfile } = context;
    
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: `Genera 3-4 preguntas discriminatorias sobre esta carrera específica:

CARRERA: ${career.name}
DESCRIPCIÓN: ${career.description}

PERFIL DEL USUARIO:
- Intereses: ${userProfile.interests.join(', ')}
- RIASEC Scores: ${JSON.stringify(userProfile.riasecScores)}

OBJETIVO: Generar preguntas que evalúen si el usuario está REALMENTE preparado para los aspectos más desafiantes de esta carrera.

TIPOS DE ASPECTOS A EXPLORAR:
🩸 FÍSICOS/EMOCIONALES: Tolerancia a elementos difíciles (sangre, estrés, confrontación)
💰 ECONÓMICOS: Inversión personal necesaria, costos de materiales/herramientas
⏰ TIEMPO: Horarios demandantes, años de estudio, compromiso temporal
🎓 EDUCACIONALES: Nivel de estudio requerido, especialización constante
🌍 AMBIENTALES: Condiciones de trabajo (peligro, aire libre, viajes)
👥 SOCIALES: Nivel de interacción, responsabilidad sobre otros

EJEMPLOS:
- Medicina: "¿Te sientes cómodo/a trabajando con sangre, heridas, y presenciando muerte?"
- Arquitectura: "¿Estás preparado/a para invertir dinero personal en software y materiales costosos?"
- Derecho: "¿Puedes manejar situaciones de alta confrontación y debates intensos?"

Responde SOLO con JSON válido:`
          },
          {
            role: "user", 
            content: `Genera preguntas discriminatorias para: ${career.name}`
          }
        ],
        temperature: 0.7,
        max_tokens: 800,
        response_format: { type: "json_object" }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from OpenAI for discriminating questions");
      }

      console.log('🤖 OpenAI discriminating questions raw response:', content);
      
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.log('❌ No JSON array found in OpenAI response, using fallback questions');
        return this.getFallbackDiscriminatingQuestions(career.name);
      }
      
      try {
        const questions = JSON.parse(jsonMatch[0]) as DiscriminatingQuestion[];
        console.log(`✅ OpenAI generated ${questions.length} discriminating questions for ${career.name}`);
        return questions;
      } catch (parseError) {
        console.error('❌ OpenAI JSON parse error for discriminating questions:', parseError);
        return this.getFallbackDiscriminatingQuestions(career.name);
      }
      
    } catch (error) {
      console.error('❌ OpenAI discriminating questions generation error:', error);
      console.error('📋 Context:', {
        careerName: career.name,
        errorType: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      console.log('🔄 Using fallback discriminating questions due to OpenAI API failure');
      return this.getFallbackDiscriminatingQuestions(career.name);
    }
  }

  /**
   * Fallback discriminating questions for when OpenAI generation fails
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

  private getFallbackResponse(): ConversationResponse {
    return {
      message: "¡Hola! Soy ARIA, tu asistente de orientación vocacional. Estoy aquí para ayudarte a descubrir qué carrera universitaria sería perfecta para ti. ¿Qué tipo de actividades realmente disfrutas hacer?",
      intent: "question",
      suggestedFollowUp: [
        "¿Prefieres trabajar con tus manos o con ideas?",
        "¿Te gusta resolver problemas complejos?",
        "¿Disfrutas ayudar a otras personas?"
      ],
      nextPhase: "enhanced_exploration"
    };
  }
}