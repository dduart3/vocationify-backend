import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function debugRiasecData() {
  console.log('🔍 Debugging RIASEC data flow...\n');
  
  // Check session_riasec_scores table
  console.log('📊 Checking session_riasec_scores table...');
  const { data: scores, error: scoresError } = await supabase
    .from('session_riasec_scores')
    .select('*')
    .limit(5);
  
  if (scoresError) {
    console.error('❌ Error fetching RIASEC scores:', scoresError.message);
  } else {
    console.log(`Found ${scores?.length || 0} RIASEC score records`);
    if (scores && scores.length > 0) {
      console.log('Sample RIASEC record:');
      console.log(JSON.stringify(scores[0], null, 2));
    }
  }
  
  console.log('\n📋 Checking test_results table...');
  const { data: results, error: resultsError } = await supabase
    .from('test_results')
    .select('*')
    .limit(3);
    
  if (resultsError) {
    console.error('❌ Error fetching test results:', resultsError.message);
  } else {
    console.log(`Found ${results?.length || 0} test result records`);
    if (results && results.length > 0) {
      console.log('Sample test result:');
      console.log(JSON.stringify(results[0], null, 2));
    }
  }
  
  // Check completed sessions
  console.log('\n🎯 Checking completed sessions...');
  const { data: sessions, error: sessionsError } = await supabase
    .from('test_sessions')
    .select('id, user_id, status, current_phase, completed_at')
    .eq('status', 'completed')
    .eq('current_phase', 'complete')
    .limit(3);
    
  if (sessionsError) {
    console.error('❌ Error fetching sessions:', sessionsError.message);
  } else {
    console.log(`Found ${sessions?.length || 0} completed sessions`);
    if (sessions && sessions.length > 0) {
      console.log('Completed sessions:', sessions);
      
      // For each completed session, check if it has RIASEC scores and results
      for (const session of sessions) {
        console.log(`\n🔍 Checking data for session ${session.id}:`);
        
        const { data: sessionScores } = await supabase
          .from('session_riasec_scores')
          .select('*')
          .eq('session_id', session.id)
          .single();
          
        const { data: sessionResults } = await supabase
          .from('test_results')
          .select('*')
          .eq('session_id', session.id)
          .single();
          
        console.log('  - RIASEC scores:', sessionScores ? '✅ EXISTS' : '❌ MISSING');
        console.log('  - Test results:', sessionResults ? '✅ EXISTS' : '❌ MISSING');
        
        if (sessionScores) {
          console.log('  - Scores:', {
            R: sessionScores.realistic_score,
            I: sessionScores.investigative_score,
            A: sessionScores.artistic_score,
            S: sessionScores.social_score,
            E: sessionScores.enterprising_score,
            C: sessionScores.conventional_score
          });
        }
      }
    }
  }
}

debugRiasecData()
  .then(() => {
    console.log('\n✅ Debug complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Debug failed:', error);
    process.exit(1);
  });