-- CONVERSATIONAL AI EXTENSIONS FOR EXISTING TABLES
-- Copy and paste this ENTIRE file into Supabase SQL Editor and run it
-- This extends your existing tables to support natural AI conversations

-- =============================================================================
-- EXTEND test_sessions TABLE FOR CONVERSATIONAL SUPPORT
-- =============================================================================

-- Add new columns to support both structured and conversational tests
ALTER TABLE test_sessions 
ADD COLUMN IF NOT EXISTS session_type VARCHAR(20) DEFAULT 'structured' 
  CHECK (session_type IN ('structured', 'conversational'));

ALTER TABLE test_sessions 
ADD COLUMN IF NOT EXISTS conversation_history JSONB DEFAULT '[]'::jsonb;

ALTER TABLE test_sessions 
ADD COLUMN IF NOT EXISTS current_phase VARCHAR(20) DEFAULT 'greeting'
  CHECK (current_phase IN ('greeting', 'exploration', 'assessment', 'recommendation', 'complete'));

ALTER TABLE test_sessions 
ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(20) DEFAULT 'gemini'
  CHECK (ai_provider IN ('gemini', 'openai', 'claude'));

ALTER TABLE test_sessions 
ADD COLUMN IF NOT EXISTS confidence_level INTEGER DEFAULT 0 
  CHECK (confidence_level >= 0 AND confidence_level <= 100);

-- =============================================================================
-- EXTEND test_results TABLE FOR AI CAREER RECOMMENDATIONS
-- =============================================================================

-- Add career recommendations field for AI-generated suggestions
ALTER TABLE test_results
ADD COLUMN IF NOT EXISTS career_recommendations JSONB DEFAULT '[]'::jsonb;

-- =============================================================================
-- CREATE INDEXES FOR PERFORMANCE
-- =============================================================================

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_test_sessions_session_type ON test_sessions(session_type);
CREATE INDEX IF NOT EXISTS idx_test_sessions_current_phase ON test_sessions(current_phase);
CREATE INDEX IF NOT EXISTS idx_test_sessions_ai_provider ON test_sessions(ai_provider);
CREATE INDEX IF NOT EXISTS idx_test_sessions_confidence ON test_sessions(confidence_level);

-- =============================================================================
-- ADD DOCUMENTATION COMMENTS
-- =============================================================================

COMMENT ON COLUMN test_sessions.session_type IS 'Type of session: structured (traditional test) or conversational (AI-driven chat)';
COMMENT ON COLUMN test_sessions.conversation_history IS 'For conversational sessions: array of messages with roles, content, and timestamps';
COMMENT ON COLUMN test_sessions.current_phase IS 'For conversational sessions: greeting → exploration → assessment → recommendation → complete';
COMMENT ON COLUMN test_sessions.ai_provider IS 'AI service used for conversational sessions: gemini (free), openai (premium), or claude';
COMMENT ON COLUMN test_sessions.confidence_level IS 'AI confidence in RIASEC assessment (0-100%)';
COMMENT ON COLUMN test_results.career_recommendations IS 'AI-generated career suggestions with confidence scores and reasoning';

-- =============================================================================
-- VERIFICATION QUERY (run this after to verify changes worked)
-- =============================================================================

-- Check that all new columns exist
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'test_sessions' 
  AND column_name IN ('session_type', 'conversation_history', 'current_phase', 'ai_provider', 'confidence_level')
ORDER BY column_name;

-- Check test_results new column
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'test_results' 
  AND column_name = 'career_recommendations';

-- Show sample of extended table structure
SELECT 
  id, 
  status, 
  session_type, 
  current_phase, 
  ai_provider, 
  confidence_level,
  created_at
FROM test_sessions 
LIMIT 1;