import OpenAI from "openai";
import { AIServiceInterface, ConversationRequest, ConversationResponse, ConversationMessage } from "./AIServiceInterface";

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
        model: "gpt-4",
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
      
      // Ensure nextPhase is set with intelligent detection
      if (!parsedResponse.nextPhase) {
        console.log('⚠️ Missing nextPhase in OpenAI response, attempting intelligent detection');
        
        if (parsedResponse.careerSuggestions && parsedResponse.careerSuggestions.length > 0) {
          console.log('🔧 Found careerSuggestions - setting nextPhase to complete');
          parsedResponse.nextPhase = 'complete';
        } else if (parsedResponse.intent === 'recommendation') {
          console.log('🔧 Intent is recommendation - setting nextPhase to complete');
          parsedResponse.nextPhase = 'complete';
        } else if (parsedResponse.intent === 'completion_check') {
          console.log('🔧 Intent is completion_check - staying in career_exploration');
          parsedResponse.nextPhase = 'career_exploration';
        } else {
          console.log('🔧 Default fallback - setting nextPhase to exploration');
          parsedResponse.nextPhase = 'exploration';
        }
      }
      
      // Additional check: If AI gave career recommendations but still set nextPhase to career_exploration,
      // check if this might be a completion scenario based on user's last message
      if (parsedResponse.nextPhase === 'career_exploration' && 
          parsedResponse.careerSuggestions && 
          parsedResponse.careerSuggestions.length > 0) {
        
        const lastUserMessage = request.messages[request.messages.length - 1]?.content?.toLowerCase() || '';
        const completionSignals = [
          'ver resultados finales',
          'los resultados finales',
          'me gustaría ver los resultados',
          'quiero ver mis resultados',
          'quiero los resultados',
          'ver los resultados',
          'estoy satisfecho',
          'terminar',
          'ya decidí',
          'resultados finales'
        ];
        
        const hasCompletionSignal = completionSignals.some(signal => 
          lastUserMessage.includes(signal)
        );
        
        if (hasCompletionSignal) {
          console.log('🔧 OpenAI: Detected completion signal in user message despite AI returning career_exploration - overriding to complete');
          parsedResponse.nextPhase = 'complete';
        }
      }

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
        model: "gpt-4",
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
    const phase = context?.currentPhase || 'exploration';
    const previousResponses = context?.userProfile?.previousResponses || [];
    
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `Eres ARIA, asistente de orientación vocacional. Genera UNA pregunta conversacional natural.

CONTEXTO:
- Fase: ${phase}
- Respuestas previas: ${previousResponses.length}
- Intereses: ${context?.userProfile?.interests?.join(', ') || 'ninguno'}

TIPOS POR FASE:
- exploration: preguntas abiertas sobre intereses
- assessment: preguntas específicas RIASEC
- recommendation: refinar recomendaciones

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

    if (phase === 'career_exploration') {
      systemPrompt += `

CONTEXTO ACTUAL - EXPLORACIÓN DE CARRERAS:
- Usuario ya tiene perfil RIASEC y recomendaciones iniciales
- Fase interactiva: responde preguntas sobre carreras específicas
- Proporciona información detallada: salarios, día típico, requisitos
- Sugiere alternativas relevantes basadas en su perfil
- Si pregunta por carrera NO disponible: sé honesto, da info general, sugiere similares >80%
- NUNCA fuerces recomendaciones que no sean realmente similares
- FINALIZACIÓN: Detecta si usuario está listo (3+ carreras exploradas, decisión clara)
- Usa intent: "completion_check" para confirmar antes de nextPhase: "complete"

DETECCIÓN DE FINALIZACIÓN CRÍTICA:
- Si usuario dice CUALQUIER variación de querer ver resultados finales:
  * "Ver resultados finales" / "Me gustaría ver los resultados finales"
  * "Quiero ver mis resultados" / "Estoy satisfecho, ver resultados"  
  * "Terminar y ver resultados" / "Ya decidí, quiero los resultados"
- → nextPhase: "complete" INMEDIATAMENTE
- Si usuario dice "Explorar más carreras" → nextPhase: "career_exploration"

CARRERAS DISPONIBLES EN MARACAIBO (USA IDs EXACTOS):
${context?.availableCareers?.slice(0, 10).map(c => `- ID: ${c.id} | ${c.name}: ${c.description?.substring(0, 150)}... (RIASEC: ${c.riasecCode})`).join('\n') || 'Cargando...'}`;
    } else {
      systemPrompt += `

OBJETIVO: Descubrir perfil vocacional RÁPIDAMENTE y recomendar carreras MUY RELEVANTES.

REGLAS:
- UNA pregunta por mensaje, nunca múltiples
- EFICIENCIA: Después de 4-6 intercambios, procede a recomendaciones
- Solo hace preguntas esenciales: intereses principales, habilidades, ambiente de trabajo
- Analiza cuidadosamente las descripciones de carreras vs intereses del usuario

CARRERAS DISPONIBLES EN MARACAIBO (USA IDs EXACTOS):
${context?.availableCareers?.map(c => `- ID: ${c.id} | ${c.name}: ${c.description?.substring(0, 180)} (RIASEC: ${c.riasecCode}, I:${c.riasecScores?.I || 0} R:${c.riasecScores?.R || 0})`).join('\n') || 'Cargando...'}

IMPORTANTE: Si mencionas carreras no en esta lista, aclara que "no están disponibles en Maracaibo actualmente"`;
    }

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
  "careerSuggestions": [{"careerId": "USAR ID EXACTO de CARRERAS DISPONIBLES", "name": "nombre EXACTO de la lista", "confidence": 0-100, "reasoning": "por qué encaja con RIASEC"}],
  "nextPhase": "exploration|assessment|recommendation|career_exploration|complete"
}`;

    return systemPrompt;
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
      nextPhase: "exploration"
    };
  }
}