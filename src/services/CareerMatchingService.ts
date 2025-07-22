import { supabase } from '../config/database';
import { RiasecScore, RiasecType } from '../types/riasec';

interface CareerMatch {
  career: {
    id: string;
    name: string;
    description: string;
    duration_years: number;
    primary_riasec_type: string;
    secondary_riasec_type: string | null;
    riasec_code: string;
    work_environment: string[];
    key_skills: string[];
    related_careers: string[];
  };
  compatibility_score: number;
  match_reasons: string[];
  riasec_alignment: {
    primary_match: boolean;
    secondary_match: boolean;
    overall_score: number;
  };
}

export class CareerMatchingService {
  static async getCareerRecommendations(
    userScores: RiasecScore,
    limit: number = 10,
    filters?: {
      duration_max?: number;
      riasec_types?: string[];
    }
  ): Promise<CareerMatch[]> {
    
    // Get user's top RIASEC types
    const topTypes = this.getTopRiasecTypes(userScores, 3);
    
    // Build query to get all careers from YOUR database
    let query = supabase
      .from('careers')
      .select('*');
    
    // Apply filters
    if (filters?.duration_max) {
      query = query.lte('duration_years', filters.duration_max);
    }
    
    if (filters?.riasec_types && filters.riasec_types.length > 0) {
      query = query.in('primary_riasec_type', filters.riasec_types);
    }
    
    const { data: careers, error } = await query;
    
    if (error) throw error;
    if (!careers) return [];
    
    // Calculate compatibility scores for all careers
    const matches = careers.map(career => ({
      career,
      ...this.calculateCompatibility(userScores, career)
    }));
    
    // Sort by compatibility and return top matches
    return matches
      .sort((a, b) => b.compatibility_score - a.compatibility_score)
      .slice(0, limit);
  }
  
  private static calculateCompatibility(userScores: RiasecScore, career: any): {
    compatibility_score: number;
    match_reasons: string[];
    riasec_alignment: any;
  } {
    
    const careerScores = {
      realistic: career.realistic_score,
      investigative: career.investigative_score,
      artistic: career.artistic_score,
      social: career.social_score,
      enterprising: career.enterprising_score,
      conventional: career.conventional_score
    };
    
    // Calculate correlation between user and career scores
    const compatibility = this.calculateCorrelation(userScores, careerScores);
    
    // Check primary/secondary type matches
    const userTopTypes = this.getTopRiasecTypes(userScores, 2);
    const primaryMatch = userTopTypes.includes(career.primary_riasec_type as RiasecType);
    const secondaryMatch = career.secondary_riasec_type && 
                          userTopTypes.includes(career.secondary_riasec_type as RiasecType);
    
    // Generate match reasons in Spanish
    const reasons = this.generateMatchReasons(userScores, career, primaryMatch, secondaryMatch);
    
    return {
      compatibility_score: Math.round(compatibility * 100),
      match_reasons: reasons,
      riasec_alignment: {
        primary_match: primaryMatch,
        secondary_match: secondaryMatch || false,
        overall_score: compatibility
      }
    };
  }
  
    private static calculateCorrelation(scores1: RiasecScore, scores2: RiasecScore): number {
    const types: (keyof RiasecScore)[] = ['realistic', 'investigative', 'artistic', 'social', 'enterprising', 'conventional'];
    
    let correlation = 0;
    let totalWeight = 0;
    
    types.forEach(type => {
      const userScore = scores1[type] || 0;
      const careerScore = (scores2[type] || 0) / 100; // Normalize to 0-1
      
      // Weight by user's score (higher user scores have more influence)
      const weight = userScore + 0.1; // Add small base weight
      correlation += (userScore * careerScore * weight);
      totalWeight += weight;
    });
    
    return totalWeight > 0 ? correlation / totalWeight : 0;
  }
  
  private static getTopRiasecTypes(scores: RiasecScore, count: number): RiasecType[] {
    return Object.entries(scores)
      .sort(([,a], [,b]) => b - a)
      .slice(0, count)
      .map(([type]) => type as RiasecType);
  }
  
  private static generateMatchReasons(
    userScores: RiasecScore, 
    career: any, 
    primaryMatch: boolean, 
    secondaryMatch: boolean
  ): string[] {
    const reasons: string[] = [];
    
    // Spanish RIASEC type descriptions
    const typeDescriptions = {
      realistic: 'trabajo práctico y manual',
      investigative: 'investigación y análisis',
      artistic: 'actividades creativas y expresivas',
      social: 'ayudar y trabajar con personas',
      enterprising: 'liderazgo y oportunidades de negocio',
      conventional: 'trabajo organizado y detallado'
    };
    
    if (primaryMatch) {
      const primaryDesc = typeDescriptions[career.primary_riasec_type as keyof typeof typeDescriptions];
      reasons.push(`Fuerte compatibilidad con tu interés principal en ${primaryDesc}`);
    }
    
    if (secondaryMatch) {
      const secondaryDesc = typeDescriptions[career.secondary_riasec_type as keyof typeof typeDescriptions];
      reasons.push(`Se alinea con tu interés secundario en ${secondaryDesc}`);
    }
    
    // Add specific skill/interest matches
    const userTopType = this.getTopRiasecTypes(userScores, 1)[0];
    if (typeDescriptions[userTopType]) {
      reasons.push(`Coincide con tu preferencia por ${typeDescriptions[userTopType]}`);
    }
    
    // Add duration-based reason if reasonable
    if (career.duration_years <= 4) {
      reasons.push(`Duración de estudios accesible (${career.duration_years} años)`);
    }
    
    // Add work environment reasons if available
    if (career.work_environment && career.work_environment.length > 0) {
      const environments = career.work_environment.slice(0, 2).join(' y ');
      reasons.push(`Ambiente de trabajo en ${environments}`);
    }
    
    return reasons;
  }
}
