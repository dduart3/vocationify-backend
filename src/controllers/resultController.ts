import { Request, Response } from 'express';
import { SessionService } from '../services/SessionService';
import { RiasecService } from '../services/RiasecService';
import { supabase } from '../config/database';
import { ApiResponse } from '../types/api';
import { asyncHandler } from '../middleware/errorHandler';

export class ResultController {
  private sessionService = new SessionService();

  getResults = asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const sessionId = req.params.sessionId;
    const context = await this.sessionService.getSession(sessionId);
       
    if (!context) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const normalizedScores = RiasecService.normalizeScores(context.current_riasec_scores);
    const riasecCode = RiasecService.getRiasecCode(normalizedScores);
    const personalityDescription = RiasecService.getPersonalityDescription(normalizedScores);
    const careerSuggestions = RiasecService.getCareerSuggestions(normalizedScores);
    const topTypes = RiasecService.getTopTypes(normalizedScores, 3);

    res.json({
      success: true,
      data: {
        session_id: sessionId,
        riasec_scores: {
          raw: context.current_riasec_scores,
          normalized: normalizedScores
        },
        riasec_code: riasecCode,
        top_types: topTypes,
        personality_description: personalityDescription,
        career_suggestions: careerSuggestions,
        question_count: context.question_count,
        analysis: {
          strongest_types: context.riasec_analysis.strongest_types,
          question_distribution: context.riasec_analysis.question_distribution
        }
      }
    });
  });

  // ENHANCED getDetailedAnalysis - NOW USING ALL YOUR METHODS
  getDetailedAnalysis = asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { sessionId } = req.params;

    // Get basic results from RiasecService
    const results = await RiasecService.calculateResults(sessionId);
    
    // Get ALL responses for detailed analysis
    const { data: responses, error: responsesError } = await supabase
      .from('test_responses')
      .select(`
        *,
        questions (
          id,
          question_text,
          category,
          riasec_weights
        )
      `)
      .eq('session_id', sessionId)
      .order('created_at');

    if (responsesError) throw responsesError;

    // NOW USE ALL YOUR ANALYSIS METHODS:
    const detailedAnalysis = {
      // From RiasecService (AI-powered analysis)
      ai_response_analysis: await RiasecService.analyzeResponsePatterns(sessionId),
      
      // From YOUR controller methods (statistical analysis)
      response_patterns: this.analyzeResponsePatterns(responses || []),
      consistency_analysis: this.analyzeConsistency(responses || []),
      timing_analysis: {
        average_response_time: this.calculateAverageResponseTime(responses || []),
        response_times_by_category: this.calculateResponseTimesByCategory(responses || [])
      }
    };
    
    // Get personalized career suggestions
    const careerSuggestions = await RiasecService.getPersonalizedCareerSuggestions(
      results.riasec_scores,
      {
        maxDuration: 6,
        limit: 15
      }
    );
    
    // Get career statistics
    const careerStats = await RiasecService.getCareerStatistics();

    res.json({
      success: true,
      data: {
        ...results,
        career_suggestions: careerSuggestions,
        career_statistics: careerStats,
        
        // COMPREHENSIVE ANALYSIS USING ALL METHODS
        detailed_analysis: detailedAnalysis,
        
        // Enhanced insights combining both analyses
        insights: this.generateInsights(detailedAnalysis, results.riasec_scores),
        
        recommendations: {
          next_steps: [
            'Explora las carreras sugeridas en detalle',
            'Considera hablar con profesionales en estos campos',
            'Investiga oportunidades de estudio en tu área',
            'Realiza prácticas o voluntariados relacionados'
          ],
          additional_resources: [
            'Orientación vocacional personalizada',
            'Visitas a universidades e institutos',
            'Entrevistas informativas con profesionales',
            'Programas de exploración de carreras'
          ]
        }
      }
    });
  });

  // NEW METHOD: Generate insights combining all analyses
  private generateInsights(analysis: any, scores: any): string[] {
    const insights: string[] = [];

    // Timing insights
    if (analysis.timing_analysis.average_response_time < 3000) {
      insights.push('Respondiste rápidamente, mostrando confianza en tus preferencias');
    } else if (analysis.timing_analysis.average_response_time > 8000) {
      insights.push('Tomaste tiempo para reflexionar, lo que indica respuestas más consideradas');
    }

    // Response pattern insights
    const patterns = analysis.response_patterns;
    if (patterns.high_responses > patterns.low_responses * 2) {
      insights.push('Muestras preferencias fuertes y claras en muchas áreas');
    } else if (patterns.low_responses > patterns.high_responses) {
      insights.push('Tienes un perfil más selectivo, con preferencias específicas');
    }

    // Consistency insights
    const consistencyValues = Object.values(analysis.consistency_analysis) as number[];
    const avgConsistency = consistencyValues.reduce((sum: number, val: number) => sum + val, 0) / consistencyValues.length;
    
    if (avgConsistency < 0.5) {
      insights.push('Muestras respuestas muy consistentes dentro de cada área');
    } else if (avgConsistency > 1.5) {
      insights.push('Tienes intereses variados dentro de cada área vocacional');
    }

    // AI analysis insights
    if (analysis.ai_response_analysis.preference_strength === 'strong') {
      insights.push('Tienes un perfil vocacional bien definido');
    } else if (analysis.ai_response_analysis.preference_strength === 'weak') {
      insights.push('Podrías beneficiarte de explorar más áreas vocacionales');
    }

    return insights;
  }

  // YOUR EXISTING METHODS - NOW BEING USED!
  private analyzeResponsePatterns(responses: any[]) {
    const patterns = {
      high_responses: 0,
      medium_responses: 0,
      low_responses: 0,
      total_responses: responses.length
    };

    responses.forEach(response => {
      if (response.response_value >= 4) patterns.high_responses++;
      else if (response.response_value >= 3) patterns.medium_responses++;
      else patterns.low_responses++;
    });

    // Add percentages
    return {
      ...patterns,
      high_percentage: Math.round((patterns.high_responses / patterns.total_responses) * 100),
      medium_percentage: Math.round((patterns.medium_responses / patterns.total_responses) * 100),
      low_percentage: Math.round((patterns.low_responses / patterns.total_responses) * 100)
    };
  }

  // FIXED: Proper type handling for riasec_weights
  private analyzeConsistency(responses: any[]) {
    // Group responses by RIASEC category based on question weights
    const categoryResponses: Record<string, number[]> = {
      realistic: [],
      investigative: [],
      artistic: [],
      social: [],
      enterprising: [],
      conventional: []
    };
       
    responses.forEach(response => {
      if (response.questions?.riasec_weights) {
        const weights = response.questions.riasec_weights as Record<string, number>;
        
        // Find the dominant RIASEC type for this question - FIXED TYPE HANDLING
        let dominantType = '';
        let maxWeight = 0;
        
        Object.entries(weights).forEach(([type, weight]) => {
          const numWeight = Number(weight);
          if (numWeight > maxWeight) {
            maxWeight = numWeight;
            dominantType = type.toLowerCase();
          }
        });

        if (dominantType && categoryResponses[dominantType]) {
          categoryResponses[dominantType].push(response.response_value);
        }
      }
    });

    // Calculate standard deviation for each category
    const consistency: Record<string, number> = {};
       
    Object.entries(categoryResponses).forEach(([category, values]) => {
      if (values.length > 1) {
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        consistency[category] = Math.round(Math.sqrt(variance) * 100) / 100;
      } else {
        consistency[category] = 0;
      }
    });

    return consistency;
  }

  private calculateAverageResponseTime(responses: any[]): number {
    if (responses.length === 0) return 0;
    
    const validResponses = responses.filter(r => r.response_time && r.response_time > 0);
    if (validResponses.length === 0) return 0;
    
    const total = validResponses.reduce((sum, response) => sum + response.response_time, 0);
    return Math.round(total / validResponses.length);
  }

  // FIXED: Proper type handling for riasec_weights
  private calculateResponseTimesByCategory(responses: any[]): Record<string, number> {
    const categoryTimes: Record<string, number[]> = {
      realistic: [],
      investigative: [],
      artistic: [],
      social: [],
      enterprising: [],
      conventional: []
    };
       
    responses.forEach(response => {
      if (response.response_time && response.questions?.riasec_weights) {
        const weights = response.questions.riasec_weights as Record<string, number>;
        
        // Find dominant category for this question - FIXED TYPE HANDLING
        let dominantType = '';
        let maxWeight = 0;
        
        Object.entries(weights).forEach(([type, weight]) => {
          const numWeight = Number(weight);
          if (numWeight > maxWeight) {
            maxWeight = numWeight;
            dominantType = type.toLowerCase();
          }
        });

        if (dominantType && categoryTimes[dominantType]) {
          categoryTimes[dominantType].push(response.response_time);
        }
      }
    });

    const averages: Record<string, number> = {};
    Object.entries(categoryTimes).forEach(([category, times]) => {
      if (times.length > 0) {
        averages[category] = Math.round(times.reduce((sum, time) => sum + time, 0) / times.length);
      } else {
        averages[category] = 0;
      }
    });

    return averages;
  }
}
