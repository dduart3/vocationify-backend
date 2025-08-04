import { supabase } from '../config/database';
import { CareerMatchingService } from './CareerMatchingService';

export interface RiasecScore {
  realistic: number;
  investigative: number;
  artistic: number;
  social: number;
  enterprising: number;
  conventional: number;
}

export type RiasecType = 'realistic' | 'investigative' | 'artistic' | 'social' | 'enterprising' | 'conventional';

interface RiasecResults {
  session_id: string;
  riasec_scores: RiasecScore;
  riasec_code: string;
  dominant_types: RiasecType[];
  personality_description: string;
  total_questions: number;
  completion_percentage: number;
}

interface ResponsePattern {
  average_response_time: number;
  response_consistency: number;
  preference_strength: 'weak' | 'moderate' | 'strong';
  most_confident_areas: RiasecType[];
  least_confident_areas: RiasecType[];
}

export class RiasecService {
  
  // Calculate final RIASEC results for a session
  static async calculateResults(sessionId: string): Promise<RiasecResults> {
    try {
      // Get session data
      const { data: session, error: sessionError } = await supabase
        .from('test_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (sessionError) throw sessionError;
      if (!session) throw new Error('Sesión no encontrada');

      // Get RIASEC scores
      const { data: scores, error: scoresError } = await supabase
        .from('session_riasec_scores')
        .select('*')
        .eq('session_id', sessionId)
        .single();

      if (scoresError) throw scoresError;
      if (!scores) throw new Error('Puntuaciones no encontradas');

      // Get total responses count
      const { count: totalQuestions } = await supabase
        .from('test_responses')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId);

      const riasecScores: RiasecScore = {
        realistic: scores.realistic_score || 0,
        investigative: scores.investigative_score || 0,
        artistic: scores.artistic_score || 0,
        social: scores.social_score || 0,
        enterprising: scores.enterprising_score || 0,
        conventional: scores.conventional_score || 0
      };

      // Calculate dominant types and RIASEC code
      const dominantTypes = this.getDominantTypes(riasecScores, 3);
      const riasecCode = this.generateRiasecCode(dominantTypes);

      // Generate personality description
      const personalityDescription = this.generatePersonalityDescription(dominantTypes, riasecScores);

      return {
        session_id: sessionId,
        riasec_scores: riasecScores,
        riasec_code: riasecCode,
        dominant_types: dominantTypes,
        personality_description: personalityDescription,
        total_questions: totalQuestions || 0,
        completion_percentage: 100
      };

    } catch (error) {
      console.error('Error calculating RIASEC results:', error);
      throw new Error('Error al calcular resultados RIASEC');
    }
  }

  // Analyze response patterns for insights - FIXED QUERY
  static async analyzeResponsePatterns(sessionId: string): Promise<ResponsePattern> {
    try {
      // Get all responses for the session with proper join
      const { data: responses, error } = await supabase
        .from('test_responses')
        .select(`
          response_value,
          response_time,
          questions!inner (
            riasec_weights
          )
        `)
        .eq('session_id', sessionId)
        .order('created_at');

      if (error) throw error;
      if (!responses || responses.length === 0) {
        throw new Error('No se encontraron respuestas');
      }

      // Calculate average response time
      const responseTimes = responses
        .filter(r => r.response_time)
        .map(r => r.response_time);
      
      const averageResponseTime = responseTimes.length > 0 
        ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
        : 0;

      // Calculate response consistency
      const responseValues = responses.map(r => r.response_value);
      const avgResponse = responseValues.reduce((sum, val) => sum + val, 0) / responseValues.length;
      const variance = responseValues.reduce((sum, val) => sum + Math.pow(val - avgResponse, 2), 0) / responseValues.length;
      const consistency = Math.max(0, 1 - (variance / 2));

      // Analyze RIASEC type confidence - FIXED ACCESS
      const typeConfidence: Record<RiasecType, { total: number; count: number }> = {
        realistic: { total: 0, count: 0 },
        investigative: { total: 0, count: 0 },
        artistic: { total: 0, count: 0 },
        social: { total: 0, count: 0 },
        enterprising: { total: 0, count: 0 },
        conventional: { total: 0, count: 0 }
      };

      responses.forEach(response => {
        // Access the question data correctly
        const question = Array.isArray(response.questions) ? response.questions[0] : response.questions;
        
        if (question?.riasec_weights) {
          const weights = question.riasec_weights as Record<string, number>;
          Object.entries(weights).forEach(([type, weight]) => {
            if (weight > 0) {
              const riasecType = type.toLowerCase() as RiasecType;
              if (typeConfidence[riasecType]) {
                typeConfidence[riasecType].total += response.response_value * weight;
                typeConfidence[riasecType].count += weight;
              }
            }
          });
        }
      });

      // Calculate average confidence per type
      const typeAverages = Object.entries(typeConfidence).map(([type, data]) => ({
        type: type as RiasecType,
        average: data.count > 0 ? data.total / data.count : 0
      }));

      typeAverages.sort((a, b) => b.average - a.average);

      const mostConfident = typeAverages.slice(0, 2).map(t => t.type);
      const leastConfident = typeAverages.slice(-2).map(t => t.type);

      // Determine preference strength
      const maxAvg = typeAverages[0]?.average || 0;
      const minAvg = typeAverages[typeAverages.length - 1]?.average || 0;
      const range = maxAvg - minAvg;
      
      const preferenceStrength: 'weak' | 'moderate' | 'strong' = 
        range < 1 ? 'weak' : range < 2 ? 'moderate' : 'strong';

      return {
        average_response_time: Math.round(averageResponseTime),
        response_consistency: Math.round(consistency * 100) / 100,
        preference_strength: preferenceStrength,
        most_confident_areas: mostConfident,
        least_confident_areas: leastConfident
      };

    } catch (error) {
      console.error('Error analyzing response patterns:', error);
      throw new Error('Error al analizar patrones de respuesta');
    }
  }

  // Get personalized career suggestions
  static async getPersonalizedCareerSuggestions(
    scores: RiasecScore,
    preferences?: {
      maxDuration?: number;
      preferredTypes?: RiasecType[];
      limit?: number;
    }
  ): Promise<any[]> {
    
    const recommendations = await CareerMatchingService.getCareerRecommendations(
      scores,
      preferences?.limit || 10,
      {
        duration_max: preferences?.maxDuration,
        riasec_types: preferences?.preferredTypes
      }
    );
    
    return recommendations;
  }

  // Get career statistics
  static async getCareerStatistics(): Promise<{
    total_careers: number;
    by_riasec_type: Record<string, number>;
    average_duration: number;
    duration_distribution: Record<string, number>;
  }> {
    
    const { data: careers, error } = await supabase
      .from('careers')
      .select('primary_riasec_type, duration_years');
    
    if (error) throw error;
    if (!careers) return {
      total_careers: 0,
      by_riasec_type: {},
      average_duration: 0,
      duration_distribution: {}
    };
    
    const byType: Record<string, number> = {};
    const durationDist: Record<string, number> = {};
    let totalDuration = 0;
    
    careers.forEach(career => {
      byType[career.primary_riasec_type] = (byType[career.primary_riasec_type] || 0) + 1;
      
      const durationRange = career.duration_years <= 2 ? '1-2 años' :
                           career.duration_years <= 4 ? '3-4 años' :
                           career.duration_years <= 6 ? '5-6 años' : '7+ años';
      durationDist[durationRange] = (durationDist[durationRange] || 0) + 1;
      
      totalDuration += career.duration_years;
    });
    
    return {
      total_careers: careers.length,
      by_riasec_type: byType,
      average_duration: Math.round((totalDuration / careers.length) * 100) / 100,
      duration_distribution: durationDist
    };
  }

  // MISSING METHODS FOR YOUR CONTROLLER - ADDED HERE:

  // Get RIASEC code from scores
  static getRiasecCode(scores: RiasecScore): string {
    const dominantTypes = this.getDominantTypes(scores, 3);
    return this.generateRiasecCode(dominantTypes);
  }

  // Get personality description
  static getPersonalityDescription(scores: RiasecScore): string {
    const dominantTypes = this.getDominantTypes(scores, 3);
    return this.generatePersonalityDescription(dominantTypes, scores);
  }

  // Get career suggestions (basic version for backward compatibility)
  static getCareerSuggestions(scores: RiasecScore): string[] {
    const dominantTypes = this.getDominantTypes(scores, 2);
    
    // Basic career suggestions based on RIASEC types
    const careerMap: Record<RiasecType, string[]> = {
      realistic: ['Ingeniero Civil', 'Técnico Mecánico', 'Arquitecto', 'Piloto'],
      investigative: ['Médico', 'Investigador', 'Científico', 'Analista de Datos'],
      artistic: ['Diseñador Gráfico', 'Músico', 'Escritor', 'Actor'],
      social: ['Psicólogo', 'Maestro', 'Trabajador Social', 'Enfermero'],
      enterprising: ['Administrador', 'Vendedor', 'Abogado', 'Empresario'],
      conventional: ['Contador', 'Secretario', 'Bibliotecario', 'Analista Financiero']
    };

    const suggestions: string[] = [];
    dominantTypes.forEach(type => {
      suggestions.push(...careerMap[type].slice(0, 3));
    });

    return [...new Set(suggestions)].slice(0, 8); // Remove duplicates and limit
  }

  // Get top RIASEC types
  static getTopTypes(scores: RiasecScore, count: number = 3): RiasecType[] {
    return this.getDominantTypes(scores, count);
  }

  // Helper method to get dominant RIASEC types
  private static getDominantTypes(scores: RiasecScore, count: number = 3): RiasecType[] {
    return Object.entries(scores)
      .sort(([,a], [,b]) => b - a)
      .slice(0, count)
      .map(([type]) => type as RiasecType);
  }

  // Generate RIASEC code from dominant types
  private static generateRiasecCode(dominantTypes: RiasecType[]): string {
    const codeMap: Record<RiasecType, string> = {
      realistic: 'R',
      investigative: 'I',
      artistic: 'A',
      social: 'S',
      enterprising: 'E',
      conventional: 'C'
    };

    return dominantTypes
      .slice(0, 3)
      .map(type => codeMap[type])
      .join('');
  }

  // Generate personality description in Spanish
  private static generatePersonalityDescription(
    dominantTypes: RiasecType[], 
    scores: RiasecScore
  ): string {
    const descriptions: Record<RiasecType, string> = {
      realistic: 'Prefieres actividades prácticas y trabajo manual. Te gusta resolver problemas concretos y trabajar con herramientas o maquinaria.',
      investigative: 'Disfrutas investigar, analizar y resolver problemas complejos. Te atrae el trabajo científico y la exploración de ideas.',
      artistic: 'Valoras la creatividad y la expresión personal. Te sientes cómodo en ambientes no estructurados donde puedes innovar.',
      social: 'Te motiva ayudar a otros y trabajar en equipo. Prefieres actividades que involucren enseñar, cuidar o aconsejar.',
      enterprising: 'Te gusta liderar, persuadir y tomar decisiones. Te sientes cómodo en roles de liderazgo y oportunidades de negocio.',
      conventional: 'Prefieres trabajar con datos, seguir procedimientos y mantener orden. Te gustan las tareas organizadas y estructuradas.'
    };

    const primaryType = dominantTypes[0];
    const secondaryType = dominantTypes[1];

    let description = `Tu perfil vocacional principal es ${primaryType.toUpperCase()}. ${descriptions[primaryType]}`;

    if (secondaryType && scores[secondaryType] > scores[primaryType] * 0.7) {
      description += ` También muestras características ${secondaryType.toUpperCase()}: ${descriptions[secondaryType]}`;
    }

    const maxScore = Math.max(...Object.values(scores));
    const minScore = Math.min(...Object.values(scores));
    const range = maxScore - minScore;

    if (range > 3) {
      description += ' Tienes preferencias vocacionales bien definidas.';
    } else if (range > 1.5) {
      description += ' Muestras un perfil vocacional moderadamente definido.';
    } else {
      description += ' Tienes intereses diversos en múltiples áreas vocacionales.';
    }

    return description;
  }

  // Normalize scores to percentages
  static normalizeScores(scores: RiasecScore): RiasecScore {
    const maxPossibleScore = 20; // Assuming max 20 questions with max weight 5 and max response 5
    
    return {
      realistic: Math.min(100, Math.round((scores.realistic / maxPossibleScore) * 100)),
      investigative: Math.min(100, Math.round((scores.investigative / maxPossibleScore) * 100)),
      artistic: Math.min(100, Math.round((scores.artistic / maxPossibleScore) * 100)),
      social: Math.min(100, Math.round((scores.social / maxPossibleScore) * 100)),
      enterprising: Math.min(100, Math.round((scores.enterprising / maxPossibleScore) * 100)),
      conventional: Math.min(100, Math.round((scores.conventional / maxPossibleScore) * 100))
    };
  }
}
