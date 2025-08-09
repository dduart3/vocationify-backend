import { AIServiceInterface } from "./AIServiceInterface";
import { GeminiAIService } from "./GeminiAIService";
import { OpenAIService } from "./OpenAIService";

export type AIProvider = 'gemini' | 'openai';

export class AIServiceFactory {
  private static instances: Map<AIProvider, AIServiceInterface> = new Map();

  static createService(provider: AIProvider, apiKey: string): AIServiceInterface {
    // Use singleton pattern to avoid recreating services
    if (this.instances.has(provider)) {
      return this.instances.get(provider)!;
    }

    let service: AIServiceInterface;

    switch (provider) {
      case 'gemini':
        service = new GeminiAIService(apiKey);
        break;
      case 'openai':
        service = new OpenAIService(apiKey);
        break;
      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }

    this.instances.set(provider, service);
    return service;
  }

  static getDefaultService(): AIServiceInterface {
    const provider = process.env.AI_PROVIDER as AIProvider || 'gemini';
    const apiKey = provider === 'gemini' 
      ? process.env.GEMINI_API_KEY!
      : process.env.OPENAI_API_KEY!;

    if (!apiKey) {
      throw new Error(`API key not found for provider: ${provider}`);
    }

    return this.createService(provider, apiKey);
  }

  static getBackupService(): AIServiceInterface {
    // Get the backup provider (opposite of the default)
    const defaultProvider = process.env.AI_PROVIDER as AIProvider || 'gemini';
    const backupProvider: AIProvider = defaultProvider === 'gemini' ? 'openai' : 'gemini';
    
    const apiKey = backupProvider === 'gemini' 
      ? process.env.GEMINI_API_KEY!
      : process.env.OPENAI_API_KEY!;

    if (!apiKey) {
      console.warn(`⚠️ Backup AI service (${backupProvider}) API key not found - fallback won't be available`);
      // Return the default service as fallback to the fallback
      return this.getDefaultService();
    }

    console.log(`🔄 Creating backup AI service: ${backupProvider}`);
    return this.createService(backupProvider, apiKey);
  }
}