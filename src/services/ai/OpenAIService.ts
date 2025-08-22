import OpenAI from "openai";
import { AIServiceInterface, ConversationRequest, ConversationResponse, ConversationMessage, CareerDiscriminatingContext, DiscriminatingQuestion } from "./AIServiceInterface";

export class OpenAIService extends AIServiceInterface {
  private openai: OpenAI;
  private readonly model = "gpt-5-mini";

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
      const lastMsg = messages[messages.length - 1];
      const lastContent = typeof lastMsg?.content === 'string' ? lastMsg.content : '[non-string content]';
      
      console.log('📤 OpenAI request:', {
        model: this.model,
        messageCount: messages.length,
        lastMessage: lastContent.substring(0, 100) + '...',
        hasSystemPrompt: messages[0]?.role === 'system'
      });

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        max_completion_tokens: 2000,
        response_format: { type: "json_object" },
        reasoning_effort: "low" // Add GPT-5 specific parameter
      });

      console.log('📥 OpenAI response summary:', {
        choices: response.choices?.length || 0,
        usage: response.usage,
        finishReason: response.choices?.[0]?.finish_reason,
        hasContent: !!response.choices?.[0]?.message?.content
      });
      
      const content = response.choices[0]?.message?.content;
      if (!content) {
        console.error('❌ OpenAI response missing content:', {
          choices: response.choices?.length || 0,
          firstChoice: response.choices?.[0],
          usage: response.usage
        });
        throw new Error("No response from OpenAI");
      }

      console.log('🤖 Raw OpenAI response:', content);
      
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.log('❌ No JSON found in OpenAI response');
        throw new Error('OpenAI response did not contain valid JSON format');
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
        throw new Error(`Failed to parse OpenAI response as JSON: ${parseError}`);
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
        model: this.model,
        messageCount: messages.length,
        errorType: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      console.log('❌ OpenAI API failure - throwing error');
      throw error;
    }
  }

  async assessRiasecFromConversation(messages: ConversationMessage[]): Promise<Record<string, number>> {
    const conversationText = messages
      .filter(msg => msg.role === 'user')
      .map(msg => msg.content)
      .join('\n');

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
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
        model: this.model,
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
        max_completion_tokens: 500,
        reasoning_effort: "low"
      });

      return response.choices[0]?.message?.content?.trim() || "¿Qué actividades te emocionan más?";
    } catch (error) {
      console.error('❌ OpenAI Question Generation Error:', error);
      console.error('📋 Question context:', {
        phase: context?.currentPhase,
        errorType: error instanceof Error ? error.name : typeof error
      });
      console.log('❌ Question generation failed - throwing error');
      throw error;
    }
  }

  private buildSystemPrompt(context: ConversationRequest['context']): string {
    const phase = context?.currentPhase || 'greeting';
    const userName = context?.userProfile?.name || '';
    
    let systemPrompt = `Eres ARIA, un consejero vocacional que ayuda a personas a decidir qué estudiar en la universidad.

PERSONALIDAD: Cálido, comprensivo, paciente - como un hermano mayor amigable.

🎓 USUARIO TÍPICO:
- Persona que quiere estudiar una carrera universitaria
- NO sabe qué carrera estudiar
- Conocimiento MÍNIMO sobre profesiones
- Solo quiere saber: "¿Qué debería estudiar?"

OBJETIVO: En 12-15 preguntas simples, descubrir qué carrera universitaria recomendarle.

⚠️ NUNCA MENCIONES: bachillerato, graduación, escuela secundaria, o cualquier referencia educativa previa

REGLAS ESTRICTAS:
- UNA pregunta por mensaje, nunca múltiples
- PREGUNTAS SIMPLES: gustos, materias favoritas, actividades que disfruta
- PROHIBIDO: preguntas sobre salarios, mercado laboral, empleos específicos  
- PROHIBIDO: preguntas complejas que requieren conocimiento profesional
- MÁXIMO 10 preguntas antes de pasar a career_matching
- NO te adelantes a las fases

🔒 CONTEXTO INTERNO - EL USUARIO NO VE ESTA INFORMACIÓN
================================================================================
CARRERAS DISPONIBLES EN MARACAIBO (${context?.availableCareers?.length || 0} opciones):
${context?.availableCareers?.map(c => `${c.id}|${c.name}|${c.riasecCode}`).join('\n') || 'Cargando...'}
================================================================================
⚠️ IMPORTANTE: El usuario NO puede ver esta lista. Es solo para tu referencia interna.
⚠️ NUNCA menciones que tienes una lista o que el usuario debe revisarla.
⚠️ Usa esta lista SOLO cuando necesites recomendar carreras específicas.

🚨 REGLAS ABSOLUTAS - VALIDACIÓN DE CAREER IDs:

FORMATO OBLIGATORIO DE IDs:
- Todos los IDs DEBEN ser UUIDs de 36 caracteres: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
- Ejemplo válido: "1f4c7b05-e51c-475b-9ba3-84497638911d"

VALIDACIÓN OBLIGATORIA:
1. El careerId DEBE existir EXACTAMENTE en la lista de arriba
2. NO se permite modificar, acortar, o crear nuevos IDs
3. BUSCAR el ID copiando y pegando desde la lista literal
4. Si no encuentras una carrera perfecta, usa la más cercana de la lista

FORMATO JSON OBLIGATORIO:
{
  "careerId": "COPIAR-EXACTO-DE-LA-LISTA-ARRIBA",
  "name": "NOMBRE-PARA-MOSTRAR-AL-USUARIO", 
  "confidence": 85
}

⛔ CUALQUIER ID que NO sea un UUID de 36 caracteres está PROHIBIDO
⛔ CUALQUIER ID que NO aparezca en la lista de arriba está PROHIBIDO

🎯 ENHANCED 4-PHASE METHODOLOGY:

=== PHASE 1: ENHANCED_EXPLORATION ===
- OBJETIVO: 12-15 preguntas SIMPLES sobre gustos y preferencias
- PROHIBIDO: careerSuggestions en esta fase
- BUENAS preguntas: materias favoritas, trabajar solo vs en equipo, actividades que disfruta
- PROHIBIDO: preguntas sobre salarios, mercado laboral, empleos específicos
- nextPhase: "enhanced_exploration" hasta ~15 respuestas
- DESPUÉS de 15 preguntas: nextPhase: "career_matching"

=== PHASE 2: CAREER_MATCHING ===  
- OBJETIVO: Análisis completo + top 3 carreras
- OBLIGATORIO: Proporcionar careerSuggestions con IDs válidos
- intent: "recommendation"
- nextPhase: "reality_check"

=== PHASE 3: REALITY_CHECK ===
- OBJETIVO: Preguntas discriminatorias sobre aspectos desafiantes  
- nextPhase: "final_results"

=== PHASE 4: FINAL_RESULTS ===
- OBJETIVO: Resultados finales ajustados por reality check
- nextPhase: "complete"

IMPORTANTE SOBRE TERMINOLOGÍA Y FLOW:
- PRIMERA RECOMENDACIÓN: Llama a esto "recomendaciones iniciales" o "top 3 carreras"
- DESPUÉS de dar las 3 carreras, SIEMPRE:
  * intent: "recommendation" 
  * nextPhase: "reality_check" (NO "complete")
  * suggestedFollowUp: ["¿Estás listo/a para evaluar las realidades de estas carreras?", "¿Quieres saber sobre los aspectos desafiantes?"]
- SOLO usa nextPhase: "complete" cuando el usuario complete el reality check`;

    systemPrompt += `

🚨 FASE ACTUAL: ${phase.toUpperCase()}
USUARIO: ${userName || 'Usuario'}

${phase === 'enhanced_exploration' ? `
🔒 INSTRUCCIONES ESPECÍFICAS PARA ENHANCED_EXPLORATION:
- NO proporciones careerSuggestions hasta llegar a career_matching fase
- BUENAS preguntas: materias favoritas, trabajar solo vs equipo, hobbies, actividades
- PROHIBIDO: preguntas sobre empleos, salarios, industrias
- PROHIBIDO dar recomendaciones de carreras ahora
- PROHIBIDO usar "Una última cosa/pregunta" excepto en la pregunta #15 (la verdaderamente final)
- MÁXIMO 15 preguntas - luego pasa a career_matching
- nextPhase: "enhanced_exploration" (hasta 15 preguntas)
- intent: "question" o "clarification" únicamente
` : ''}

${phase === 'career_matching' ? `
🔒 INSTRUCCIONES ESPECÍFICAS PARA CAREER_MATCHING:
- OBLIGATORIO: Proporcionar careerSuggestions con top 3 carreras
- Usar IDs exactos de la lista de carreras disponibles
- intent: "recommendation" 
- nextPhase: "reality_check"
` : ''}

${phase === 'reality_check' ? `
🔒 INSTRUCCIONES ESPECÍFICAS PARA REALITY_CHECK:
- Haz preguntas sobre aspectos DESAFIANTES de estudiar las carreras recomendadas
- Ejemplos: dificultad matemática, años de estudio, dedicación de tiempo
- MÍNIMO 3-4 preguntas antes de pasar a final_results
- nextPhase: "reality_check" (mantener hasta completar evaluación)
- SOLO usar nextPhase: "final_results" después de evaluar aspectos difíciles
` : ''}

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
        model: this.model,
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
        max_completion_tokens: 2000,
        response_format: { type: "json_object" },
        reasoning_effort: "low"
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from OpenAI for discriminating questions");
      }

      console.log('🤖 OpenAI discriminating questions raw response:', content);
      
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.log('❌ No JSON array found in OpenAI response');
        throw new Error('OpenAI response did not contain valid JSON array format for discriminating questions');
      }
      
      try {
        const questions = JSON.parse(jsonMatch[0]) as DiscriminatingQuestion[];
        console.log(`✅ OpenAI generated ${questions.length} discriminating questions for ${career.name}`);
        return questions;
      } catch (parseError) {
        console.error('❌ OpenAI JSON parse error for discriminating questions:', parseError);
        throw new Error(`Failed to parse OpenAI discriminating questions as JSON: ${parseError}`);
      }
      
    } catch (error) {
      console.error('❌ OpenAI discriminating questions generation error:', error);
      console.error('📋 Context:', {
        careerName: career.name,
        errorType: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      console.log('❌ Discriminating questions generation failed - throwing error');
      throw error;
    }
  }

}