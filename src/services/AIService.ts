import { config } from '../config/environment';
import { Question, RiasecType, RiasecWeights } from '../types/riasec';

export class AIService {
  private apiKey: string;

  constructor() {
    this.apiKey = config.ai.openaiApiKey || '';
  }

  async generateQuestion(
    riasecType: RiasecType,
    context: any
  ): Promise<Question | null> {
    if (!this.apiKey) {
      console.warn('OpenAI API key not configured, skipping AI question generation');
      return null;
    }

    try {
      const prompt = this.buildPrompt(riasecType, context);
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'Eres un experto en psicología vocacional y el modelo RIASEC. Genera preguntas para tests vocacionales.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 200,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json() as any;
      const generatedText = data.choices[0]?.message?.content?.trim();

      if (!generatedText) {
        return null;
      }

      return this.parseAIResponse(generatedText, riasecType);
    } catch (error) {
      console.error('AI question generation failed:', error);
      return null;
    }
  }

  private buildPrompt(riasecType: RiasecType, context: any): string {
    const typeDescriptions = {
      realistic: 'trabajo práctico, herramientas, actividades físicas',
      investigative: 'investigación, análisis, resolución de problemas',
      artistic: 'creatividad, expresión artística, originalidad',
      social: 'ayuda a otros, trabajo en equipo, enseñanza',
      enterprising: 'liderazgo, persuasión, emprendimiento',
      conventional: 'organización, datos, procedimientos'
    };

    return `
Genera una pregunta para un test vocacional RIASEC enfocada en el tipo "${riasecType}" (${typeDescriptions[riasecType]}).

La pregunta debe:
- Estar en español
- Ser clara y directa
- Evaluar intereses relacionados con ${riasecType}
- Ser respondida en escala 1-5 (1=Muy en desacuerdo, 5=Muy de acuerdo)
- Ser diferente a las preguntas ya realizadas

Responde solo con la pregunta, sin explicaciones adicionales.
    `.trim();
  }

  private parseAIResponse(response: string, riasecType: RiasecType): Question {
    // Clean the response
    const questionText = response.replace(/^["']|["']$/g, '').trim();
    
    // Generate weights based on the target type
    const weights: RiasecWeights = {
      R: riasecType === 'realistic' ? 3 : 0,
      I: riasecType === 'investigative' ? 3 : 0,
      A: riasecType === 'artistic' ? 3 : 0,
      S: riasecType === 'social' ? 3 : 0,
      E: riasecType === 'enterprising' ? 3 : 0,
      C: riasecType === 'conventional' ? 3 : 0
    };

    // Add some secondary weight
    const secondaryTypes = this.getSecondaryTypes(riasecType);
    if (secondaryTypes.length > 0) {
      const secondaryType = secondaryTypes[Math.floor(Math.random() * secondaryTypes.length)];
      weights[this.riasecTypeToKey(secondaryType)] = 1;
    }

    return {
      id: `ai_${riasecType}_${Date.now()}`,
      text: questionText,
      category: riasecType,
      riasec_weights: weights,
      response_type: 'scale',
      scale: { min: 1, max: 5 }
    };
  }

  private getSecondaryTypes(primaryType: RiasecType): RiasecType[] {
    const relationships: Record<RiasecType, RiasecType[]> = {
      realistic: ['investigative', 'conventional'],
      investigative: ['realistic', 'artistic'],
      artistic: ['investigative', 'social'],
      social: ['artistic', 'enterprising'],
      enterprising: ['social', 'conventional'],
      conventional: ['enterprising', 'realistic']
    };

    return relationships[primaryType] || [];
  }

  private riasecTypeToKey(type: RiasecType): keyof RiasecWeights {
    const mapping: Record<RiasecType, keyof RiasecWeights> = {
      realistic: 'R',
      investigative: 'I',
      artistic: 'A',
      social: 'S',
      enterprising: 'E',
      conventional: 'C'
    };
    return mapping[type];
  }
}
