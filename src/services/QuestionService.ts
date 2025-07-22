import { QuestionModel } from '../models/Question';
import { SessionService } from './SessionService';
import { Question, RiasecType } from '../types/riasec';

export class QuestionService {
  private sessionService = new SessionService();

  async getNextQuestion(sessionId: string): Promise<Question | null> {
    const context = await this.sessionService.getSession(sessionId);
    if (!context) return null;

    // Check if test should continue
    if (!context.test_state.should_continue) {
      return null; // Test complete
    }

    // Select target RIASEC type
    const targetType = this.selectTargetRiasecType(context);
    
    // Get question for target type
    return this.getQuestionForType(targetType, context.asked_questions);
  }

  getQuestionById(questionId: string): Question | null {
    return QuestionModel.findById(questionId);
  }

  private selectTargetRiasecType(context: any): RiasecType {
    // Priority 1: Underexplored types
    if (context.riasec_analysis.underexplored_types.length > 0) {
      return context.riasec_analysis.underexplored_types[0];
    }

    // Priority 2: Weakest types (to confirm they're actually weak)
    if (context.riasec_analysis.weakest_types.length > 0) {
      return context.riasec_analysis.weakest_types[0];
    }

    // Priority 3: Strongest types (to confirm they're actually strong)
    return context.riasec_analysis.strongest_types[0];
  }

  private getQuestionForType(riasecType: RiasecType, askedQuestions: string[]): Question | null {
    // Try to get question from specific category first
    const categoryQuestion = QuestionModel.getRandomByCategory(riasecType, askedQuestions);
    if (categoryQuestion) return categoryQuestion;

    // Fallback to any available question
    return QuestionModel.getRandomQuestion(askedQuestions);
  }
}
