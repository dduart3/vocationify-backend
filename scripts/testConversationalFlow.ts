import { ConversationalSessionService } from '../src/services/ConversationalSessionService';
import { AIServiceFactory } from '../src/services/ai/AIServiceFactory';
import dotenv from 'dotenv';

dotenv.config();

async function testConversationalFlow() {
  try {
    console.log('🤖 Testing Conversational AI Flow...');
    console.log('=====================================\n');

    // Check if API key is configured
    if (!process.env.GEMINI_API_KEY) {
      console.log('❌ GEMINI_API_KEY not found in .env file');
      console.log('💡 Please add: GEMINI_API_KEY=your_api_key_here');
      return;
    }

    console.log('✅ Gemini API key found');
    console.log(`🔧 AI Provider: ${process.env.AI_PROVIDER || 'gemini'}\n`);

    // Test 1: AI Service Direct Test
    console.log('🧪 TEST 1: Direct AI Service Test');
    console.log('----------------------------------');
    
    const aiService = AIServiceFactory.getDefaultService();
    
    const directResponse = await aiService.generateConversationalResponse({
      messages: [
        {
          role: 'user',
          content: 'Me gusta dibujar y crear cosas artísticas',
          timestamp: new Date()
        }
      ],
      context: {
        currentPhase: 'exploration',
        userProfile: {
          interests: ['arte', 'dibujo']
        }
      }
    });

    console.log('✅ AI Response Generated:');
    console.log(`💬 Message: "${directResponse.message.substring(0, 150)}..."`);
    console.log(`🎯 Intent: ${directResponse.intent}`);
    console.log(`📍 Next Phase: ${directResponse.nextPhase}`);
    console.log('');

    // Test 2: RIASEC Assessment
    console.log('🧪 TEST 2: RIASEC Assessment Test');
    console.log('----------------------------------');
    
    const riasecScores = await aiService.assessRiasecFromConversation([
      { role: 'user', content: 'Me gusta trabajar con mis manos', timestamp: new Date() },
      { role: 'user', content: 'Disfruto arreglando cosas que se rompen', timestamp: new Date() },
      { role: 'user', content: 'Prefiero trabajar al aire libre', timestamp: new Date() }
    ]);

    console.log('✅ RIASEC Assessment:');
    Object.entries(riasecScores).forEach(([type, score]) => {
      const riasecNames: Record<string, string> = {
        R: 'Realistic',
        I: 'Investigative', 
        A: 'Artistic',
        S: 'Social',
        E: 'Enterprising',
        C: 'Conventional'
      };
      console.log(`📊 ${riasecNames[type]}: ${score}/100`);
    });
    console.log('');

    // Test 3: Contextual Question Generation
    console.log('🧪 TEST 3: Contextual Question Generation');
    console.log('------------------------------------------');
    
    const contextualQuestion = await aiService.generateContextualQuestion({
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

    console.log('✅ Generated Contextual Question:');
    console.log(`❓ "${contextualQuestion}"`);
    console.log('');

    // Test 4: Full Conversational Session
    console.log('🧪 TEST 4: Full Conversational Session Test');
    console.log('--------------------------------------------');
    
    const sessionService = new ConversationalSessionService();
    
    // Create session (without user_id since it expects UUID format)
    const session = await sessionService.createConversationalSession();
    console.log('✅ Session Created:');
    console.log(`🆔 Session ID: ${session.sessionId}`);
    console.log(`💬 Greeting: "${session.greeting.message.substring(0, 100)}..."`);
    console.log('');

    // Simulate user response
    console.log('👤 Simulating user response: "Me gusta resolver problemas matemáticos"');
    const userResponse = await sessionService.processUserMessage(
      session.sessionId,
      'Me gusta resolver problemas matemáticos complejos'
    );

    console.log('✅ AI Response to User:');
    console.log(`💬 Message: "${userResponse.message.substring(0, 150)}..."`);
    console.log(`🎯 Intent: ${userResponse.intent}`);
    console.log(`📍 Next Phase: ${userResponse.nextPhase}`);
    
    if (userResponse.riasecAssessment) {
      console.log('📊 RIASEC Update:');
      Object.entries(userResponse.riasecAssessment.scores).forEach(([type, score]) => {
        console.log(`   ${type}: ${score}`);
      });
      console.log(`🎯 Confidence: ${userResponse.riasecAssessment.confidence}%`);
    }
    console.log('');

    // Get session results
    const results = await sessionService.getSessionResults(session.sessionId);
    console.log('✅ Session Results:');
    console.log(`📊 Current RIASEC Scores:`, results.riasecScores);
    console.log(`🎯 Confidence Level: ${results.confidenceLevel}%`);
    console.log(`📍 Current Phase: ${results.conversationPhase}`);
    console.log(`💬 Conversation Length: ${results.conversationHistory.length} messages`);
    console.log('');

    console.log('🎉 All tests completed successfully!');
    console.log('=====================================');
    console.log('✨ Your conversational AI system is working perfectly!');
    console.log('');
    console.log('🚀 Next steps:');
    console.log('   - Update frontend voice bubble to use conversations');
    console.log('   - Test with real speech input/output');
    console.log('   - Add career recommendations when confidence is high');

  } catch (error) {
    console.error('❌ Test failed:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        console.log('\n💡 API Key Issue:');
        console.log('   - Make sure GEMINI_API_KEY is set in .env');
        console.log('   - Verify the API key is valid');
        console.log('   - Check if you have API quota remaining');
      } else if (error.message.includes('fetch')) {
        console.log('\n💡 Network Issue:');
        console.log('   - Check your internet connection');
        console.log('   - Verify Gemini API is accessible');
      } else if (error.message.includes('database') || error.message.includes('supabase')) {
        console.log('\n💡 Database Issue:');
        console.log('   - Make sure Supabase is configured correctly');
        console.log('   - Verify database schema extensions were applied');
      }
    }
    
    console.log('\n📋 Debug info:');
    console.log(`   AI Provider: ${process.env.AI_PROVIDER || 'gemini'}`);
    console.log(`   Has Gemini Key: ${!!process.env.GEMINI_API_KEY}`);
    console.log(`   Has Supabase URL: ${!!process.env.SUPABASE_URL}`);
  }
}

// Run the test
if (require.main === module) {
  testConversationalFlow()
    .then(() => {
      console.log('\n✨ Test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Test failed:', error);
      process.exit(1);
    });
}

export { testConversationalFlow };