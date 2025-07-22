-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Test sessions table
CREATE TABLE test_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID DEFAULT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Test responses table
CREATE TABLE test_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES test_sessions(id) ON DELETE CASCADE,
    question_id VARCHAR(100) NOT NULL,
    question_text TEXT NOT NULL,
    question_category VARCHAR(20) NOT NULL CHECK (question_category IN ('realistic', 'investigative', 'artistic', 'social', 'enterprising', 'conventional')),
    response_value INTEGER NOT NULL CHECK (response_value >= 1 AND response_value <= 5),
    response_time INTEGER NOT NULL DEFAULT 0,
    question_order INTEGER NOT NULL,
    riasec_weights JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Session RIASEC scores table
CREATE TABLE session_riasec_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES test_sessions(id) ON DELETE CASCADE,
    realistic_score DECIMAL(8,4) DEFAULT 0,
    investigative_score DECIMAL(8,4) DEFAULT 0,
    artistic_score DECIMAL(8,4) DEFAULT 0,
    social_score DECIMAL(8,4) DEFAULT 0,
    enterprising_score DECIMAL(8,4) DEFAULT 0,
    conventional_score DECIMAL(8,4) DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(session_id)
);

-- Test results table
CREATE TABLE test_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES test_sessions(id) ON DELETE CASCADE,
    final_riasec_profile JSONB NOT NULL,
    personality_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(session_id)
);

-- Indexes for performance
CREATE INDEX idx_test_sessions_status ON test_sessions(status);
CREATE INDEX idx_test_sessions_created_at ON test_sessions(created_at);
CREATE INDEX idx_test_responses_session_id ON test_responses(session_id);
CREATE INDEX idx_test_responses_question_order ON test_responses(session_id, question_order);
CREATE INDEX idx_session_riasec_scores_session_id ON session_riasec_scores(session_id);

-- Update trigger for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_test_sessions_updated_at BEFORE UPDATE ON test_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_session_riasec_scores_updated_at BEFORE UPDATE ON session_riasec_scores FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
