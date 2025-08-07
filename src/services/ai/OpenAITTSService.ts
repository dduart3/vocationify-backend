import OpenAI from 'openai';

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
}