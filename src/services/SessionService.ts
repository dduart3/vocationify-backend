import { SessionModel } from '../models/Session';
import { ResponseModel } from '../models/Response';
import { SessionContext, RiasecScore, RiasecType, TestResponse, RiasecWeights } from '../types/riasec';

export class SessionService {
  async createSession(userId?: string): Promise<string> {
    const session = await SessionModel.create(userId);
    await SessionModel.createRiasecScores(session.id);
    return session.id;
  }

  async getSession(sessionId: string): Promise<SessionContext | null> {
    const session = await SessionModel.findById(sessionId);
    if (!session) return null;

    const responses = await ResponseModel.findBySessionId(sessionId);
    const riasecScoresData = await SessionModel.getRiasecScores(sessionId);
    
    if (!riasecScoresData) return null;

    const riasecScores = this.mapRiasecScores(riasecScoresData);
    const mappedResponses = responses.map(this.mapResponse);

    return {
      session_id: sessionId,
      question_count: responses.length,
      responses: mappedResponses,
      current_riasec_scores: riasecScores,
      riasec_analysis: this.analyzeRiasec(riasecScores, mappedResponses),
      test_state: this.analyzeTestState(mappedResponses, riasecScores),
      asked_questions: mappedResponses.map(r => r.question_id)
    };
  }

  async saveResponse(
    sessionId: string,
    questionId: string,
    questionText: string,
    questionCategory: RiasecType,
    responseValue: number,
    responseTime: number,
    riasecWeights: RiasecWeights
  ): Promise<void> {
    const questionOrder = await ResponseModel.getNextQuestionOrder(sessionId);
    
    // Save response
    await ResponseModel.create(
      sessionId,
      questionId,
      questionText,
      questionCategory,
      responseValue,
      responseTime,
      questionOrder,
      riasecWeights
    );

    // Update RIASEC scores
    await this.updateRiasecScores(sessionId, responseValue, riasecWeights);
  }

  async completeSession(sessionId: string): Promise<void> {
    await SessionModel.updateStatus(sessionId, 'completed');
  }

  private async updateRiasecScores(
    sessionId: string,
    responseValue: number,
    riasecWeights: RiasecWeights
  ): Promise<void> {
    const currentScoresData = await SessionModel.getRiasecScores(sessionId);
    if (!currentScoresData) throw new Error('RIASEC scores not found');

    // Normalize response (1-5 scale to 0-1)
    const normalizedResponse = (responseValue - 1) / 4;
    
    const updates: Partial<RiasecScore> = {};
    
    // Update each RIASEC dimension
    if (riasecWeights.R > 0) {
      updates.realistic = currentScoresData.realistic_score + (normalizedResponse * riasecWeights.R);
    }
    if (riasecWeights.I > 0) {
      updates.investigative = currentScoresData.investigative_score + (normalizedResponse * riasecWeights.I);
    }
    if (riasecWeights.A > 0) {
      updates.artistic = currentScoresData.artistic_score + (normalizedResponse * riasecWeights.A);
    }
    if (riasecWeights.S > 0) {
      updates.social = currentScoresData.social_score + (normalizedResponse * riasecWeights.S);
    }
    if (riasecWeights.E > 0) {
      updates.enterprising = currentScoresData.enterprising_score + (normalizedResponse * riasecWeights.E);
    }
    if (riasecWeights.C > 0) {
      updates.conventional = currentScoresData.conventional_score + (normalizedResponse * riasecWeights.C);
    }

    await SessionModel.updateRiasecScores(sessionId, updates);
  }

  private analyzeRiasec(riasecScores: RiasecScore, responses: TestResponse[]) {
    const scores = [
      { type: 'realistic' as RiasecType, score: riasecScores.realistic },
      { type: 'investigative' as RiasecType, score: riasecScores.investigative },
      { type: 'artistic' as RiasecType, score: riasecScores.artistic },
      { type: 'social' as RiasecType, score: riasecScores.social },
      { type: 'enterprising' as RiasecType, score: riasecScores.enterprising },
      { type: 'conventional' as RiasecType, score: riasecScores.conventional }
    ];

    const sortedByScore = scores.sort((a, b) => b.score - a.score);
    const questionDistribution = this.calculateQuestionDistribution(responses);

    return {
      strongest_types: sortedByScore.slice(0, 2).map(s => s.type),
      weakest_types: sortedByScore.slice(-2).map(s => s.type),
      underexplored_types: this.findUnderexploredTypes(questionDistribution),
      question_distribution: questionDistribution
    };
  }

  private analyzeTestState(responses: TestResponse[], riasecScores: RiasecScore) {
    const responseCount = responses.length;
    const hasMinimumQuestions = responseCount >= 12;
    const hasGoodDistribution = this.hasGoodQuestionDistribution(responses);
    const hasMaxQuestions = responseCount >= 20;

    return {
      can_complete: hasMinimumQuestions && hasGoodDistribution,
      should_continue: !hasMaxQuestions && (!hasMinimumQuestions || !hasGoodDistribution),
      estimated_remaining_questions: Math.max(0, 15 - responseCount)
    };
  }

  private calculateQuestionDistribution(responses: TestResponse[]): Record<RiasecType, number> {
    const distribution: Record<RiasecType, number> = {
      realistic: 0,
      investigative: 0,
      artistic: 0,
      social: 0,
      enterprising: 0,
      conventional: 0
    };

    responses.forEach(response => {
      distribution[response.question_category]++;
    });

    return distribution;
  }

  private findUnderexploredTypes(distribution: Record<RiasecType, number>): RiasecType[] {
    const minQuestions = 2;
    return Object.entries(distribution)
      .filter(([_, count]) => count < minQuestions)
      .map(([type, _]) => type as RiasecType);
  }

  private hasGoodQuestionDistribution(responses: TestResponse[]): boolean {
    const distribution = this.calculateQuestionDistribution(responses);
    return Object.values(distribution).every(count => count >= 1);
  }

  private mapResponse(response: any): TestResponse {
    return {
      id: response.id,
      session_id: response.session_id,
      question_id: response.question_id,
      question_text: response.question_text,
      question_category: response.question_category,
      response_value: response.response_value,
      response_time: response.response_time,
      question_order: response.question_order,
      riasec_weights: response.riasec_weights,
      created_at: new Date(response.created_at)
    };
  }

  private mapRiasecScores(scores: any): RiasecScore {
    return {
      realistic: scores.realistic_score,
      investigative: scores.investigative_score,
      artistic: scores.artistic_score,
      social: scores.social_score,
      enterprising: scores.enterprising_score,
      conventional: scores.conventional_score
    };
  }
}
