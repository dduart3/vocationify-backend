import { AIServiceFactory } from '../src/services/ai/AIServiceFactory';
import { ConversationMessage } from '../src/services/ai/AIServiceInterface';
import dotenv from 'dotenv';

dotenv.config();

async function testAIService() {
  try {
    console.log('🤖 Testing AI Service Architecture...');
    
    // Test with Gemini (free)
    if (process.env.GEMINI_API_KEY) {
      console.log('\n🔮 Testing Gemini Service...');
      const geminiService = AIServiceFactory.createService('gemini', process.env.GEMINI_API_KEY);
      
      const testMessages: ConversationMessage[] = [
        {
          role: 'user',
          content: 'Me gusta dibujar y crear cosas artísticas',
          timestamp: new Date()
        }
      ];

      const response = await geminiService.generateConversationalResponse({
        messages: testMessages,
        context: {
          currentPhase: 'exploration',
          userProfile: {
            interests: ['arte', 'dibujo']
          }
        }
      });

      console.log('✅ Gemini Response:', {
        message: response.message.substring(0, 100) + '...',
        intent: response.intent,
        nextPhase: response.nextPhase
      });
    }

    // Test with OpenAI (if available)
    if (process.env.OPENAI_API_KEY) {
      console.log('\n🧠 Testing OpenAI Service...');
      const openaiService = AIServiceFactory.createService('openai', process.env.OPENAI_API_KEY);
      
      const testMessages: ConversationMessage[] = [
        {
          role: 'user',
          content: 'Me gusta resolver problemas matemáticos complejos',
          timestamp: new Date()
        }
      ];

      const response = await openaiService.generateConversationalResponse({
        messages: testMessages,
        context: {
          currentPhase: 'exploration',
          userProfile: {
            interests: ['matemáticas', 'lógica']
          }
        }
      });

      console.log('✅ OpenAI Response:', {
        message: response.message.substring(0, 100) + '...',
        intent: response.intent,
        nextPhase: response.nextPhase
      });
    }

    // Test RIASEC assessment
    console.log('\n📊 Testing RIASEC Assessment...');
    const defaultService = AIServiceFactory.getDefaultService();
    
    const conversationMessages: ConversationMessage[] = [
      { role: 'user', content: 'Me gusta trabajar con mis manos', timestamp: new Date() },
      { role: 'user', content: 'Disfruto arreglando cosas que se rompen', timestamp: new Date() },
      { role: 'user', content: 'Prefiero trabajar al aire libre', timestamp: new Date() }
    ];

    const riasecScores = await defaultService.assessRiasecFromConversation(conversationMessages);
    console.log('✅ RIASEC Assessment:', riasecScores);

    // Test contextual question generation
    console.log('\n❓ Testing Question Generation...');
    const question = await defaultService.generateContextualQuestion({
      currentPhase: 'assessment',
      userProfile: {
        interests: ['tecnología', 'programación'],
        previousResponses: [
          {
            question: '¿Qué te gusta hacer?',
            response: 'Me gusta programar',
            riasecScores: { R: 20, I: 80, A: 30, S: 10, E: 15, C: 60 }
          }
        ]
      }
    });

    console.log('✅ Generated Question:', question);

    console.log('\n🎉 AI Service Architecture test completed successfully!');

  } catch (error) {
    console.error('❌ AI Service test failed:', error);
    
    if (error instanceof Error && error.message.includes('API key')) {
      console.log('\n💡 Make sure to set your API keys in .env:');
      console.log('   - GEMINI_API_KEY (free option)');
      console.log('   - OPENAI_API_KEY (premium option)');
    }
  }
}

// Run test
if (require.main === module) {
  testAIService()
    .then(() => {
      console.log('✨ Test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Test failed:', error);
      process.exit(1);
    });
}

export { testAIService };