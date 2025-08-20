-- Update phase constraints for enhanced 4-phase methodology
-- This migration updates the CHECK constraint to support the new phase names

-- First, drop the existing constraint
ALTER TABLE test_sessions 
DROP CONSTRAINT IF EXISTS test_sessions_current_phase_check;

-- Add the new constraint with updated phase names
ALTER TABLE test_sessions 
ADD CONSTRAINT test_sessions_current_phase_check 
CHECK (current_phase IN ('greeting', 'enhanced_exploration', 'career_matching', 'reality_check', 'final_results', 'complete'));

-- Update the comment to reflect new methodology
COMMENT ON COLUMN test_sessions.current_phase IS 'Enhanced 4-phase methodology: greeting → enhanced_exploration → career_matching → reality_check → final_results → complete';