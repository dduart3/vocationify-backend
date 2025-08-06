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

      return JSON.parse(content) as ConversationResponse;
    } catch (error) {
      console.error('OpenAI Error:', error);
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
      console.error('RIASEC Assessment Error:', error);
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
      console.error('Question Generation Error:', error);
      return "¿Qué tipo de actividades disfrutas más?";
    }
  }

  private buildSystemPrompt(context: ConversationRequest['context']): string {
    const phase = context?.currentPhase || 'greeting';
    const userName = context?.userProfile?.name || '';
    
    return `Eres ARIA, un asistente de orientación vocacional inteligente y conversacional.

PERSONALIDAD: Cálido, empático, profesional, natural (no robótico)

OBJETIVO: Descubrir perfil vocacional mediante conversación natural y recomendar las 3 mejores carreras.

FASE ACTUAL: ${phase}
USUARIO: ${userName || 'Usuario'}

CARRERAS DISPONIBLES:
${context?.availableCareers?.map(c => `- ${c.name}: ${c.description}`).join('\n') || 'Cargando...'}

Responde SIEMPRE en formato JSON con esta estructura:
{
  "message": "respuesta conversacional",
  "intent": "question|clarification|assessment|recommendation|farewell",
  "suggestedFollowUp": ["pregunta1", "pregunta2"],
  "riasecAssessment": {
    "scores": {"R": 0-100, "I": 0-100, "A": 0-100, "S": 0-100, "E": 0-100, "C": 0-100},
    "confidence": 0-100,
    "reasoning": "explicación"
  },
  "careerSuggestions": [{"careerId": "id", "name": "nombre", "confidence": 0-100, "reasoning": "razón"}],
  "nextPhase": "exploration|assessment|recommendation|complete"
}`;
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