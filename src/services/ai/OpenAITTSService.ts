import OpenAI from 'openai';

export interface TTSOptions {
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  model?: 'tts-1' | 'tts-1-hd' | 'gpt-4o-mini-tts';
  speed?: number; // 0.25 to 4.0
}

export class OpenAITTSService {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  async generateSpeech(text: string, voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova'): Promise<Buffer> {
    try {
      const mp3 = await this.openai.audio.speech.create({
        model: 'tts-1',
        voice: voice,
        input: text,
        speed: 0.9,
      });

      return Buffer.from(await mp3.arrayBuffer());
    } catch (error) {
      console.error('OpenAI TTS error:', error);
      throw error;
    }
  }

  async generateHighQualitySpeech(text: string, voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova'): Promise<Buffer> {
    try {
      const mp3 = await this.openai.audio.speech.create({
        model: 'tts-1-hd', // Higher quality model
        voice: voice,
        input: text,
        speed: 0.9,
      });

      return Buffer.from(await mp3.arrayBuffer());
    } catch (error) {
      console.error('OpenAI TTS HD error:', error);
      throw error;
    }
  }

  async generateSpeechWithOptions(text: string, options: TTSOptions = {}): Promise<Buffer> {
    const {
      voice = 'shimmer', // Warm feminine voice for better user experience
      model = 'gpt-4o-mini-tts', // Use cheapest model for maximum cost efficiency
      speed = 0.9 // Slightly slower for better clarity and comprehension
    } = options;

    // Add context-specific voice instructions for vocational guidance
    const voiceInstructions = this.getVoiceInstructionsForContext(text);

    try {
      if (voiceInstructions) {
        console.log(`🎭 Applied voice instructions: ${voiceInstructions.substring(0, 80)}...`);
      }
      console.log(`🎤 Generating OpenAI TTS: model=${model}, voice=${voice}, speed=${speed}, text=${text.substring(0, 50)}...`);
      
      const speechOptions: any = {
        model,
        voice,
        input: text, // Keep original text clean
        speed: Math.max(0.25, Math.min(4.0, speed)), // Clamp speed to valid range
        response_format: 'mp3', // MP3 for best browser compatibility and smaller file size
      };

      // Add instructions field if available (for gpt-4o-mini-tts)
      if (voiceInstructions && model === 'gpt-4o-mini-tts') {
        speechOptions.instructions = voiceInstructions;
      }

      const mp3 = await this.openai.audio.speech.create(speechOptions);

      const buffer = Buffer.from(await mp3.arrayBuffer());
      console.log(`✅ OpenAI TTS generated ${buffer.length} bytes of audio`);
      
      return buffer;
    } catch (error) {
      console.error('OpenAI TTS error:', error);
      throw error;
    }
  }

  private getVoiceInstructionsForContext(text: string): string | null {
    // Analyze content type for appropriate voice instructions
    const lowerText = text.toLowerCase();
    
    // Welcome/greeting messages
    if (lowerText.includes('bienvenid') || lowerText.includes('hola') || lowerText.includes('comenzar')) {
      return 'Speak with an enthusiastic, warm, and welcoming tone - like a friendly career counselor excited to help a young adult discover their future career path';
    }
    
    // Questions during the test
    if (lowerText.includes('¿') || lowerText.includes('pregunta') || lowerText.includes('qué') || lowerText.includes('cómo')) {
      return 'Speak in a conversational, encouraging tone - like a supportive mentor asking thoughtful questions to help a teenager explore their interests and potential career paths';
    }
    
    // Completion/results messages
    if (lowerText.includes('basado en') || lowerText.includes('resultados') || lowerText.includes('carrera') || lowerText.includes('recomend')) {
      return 'Speak with excitement and confidence - like a career counselor sharing exciting career discoveries with a young person, celebrating their potential and future possibilities';
    }
    
    // Instructions or explanations
    if (lowerText.includes('necesito') || lowerText.includes('importante') || lowerText.includes('recuerda')) {
      return 'Speak clearly and supportively - like a patient teacher explaining something important to help a student succeed in their career exploration journey';
    }
    
    // Default for general vocational guidance content
    return 'Speak with a cheerful, encouraging tone - like ARIA, a friendly AI career guide helping young adults discover their perfect career match with enthusiasm and support';
  }
}