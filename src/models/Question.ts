import { Question, RiasecType, RiasecWeights } from '../types/riasec';

export class QuestionModel {
  private static questionBank: Record<RiasecType, Question[]> = {
    realistic: [
      {
        id: 'realistic_001',
        text: 'Me gusta trabajar con herramientas y maquinaria',
        category: 'realistic',
        riasec_weights: { R: 3, I: 1, A: 0, S: 0, E: 0, C: 0 },
        response_type: 'scale',
        scale: { min: 1, max: 5 }
      },
      {
        id: 'realistic_002',
        text: 'Prefiero trabajos donde pueda usar mis manos',
        category: 'realistic',
        riasec_weights: { R: 3, I: 0, A: 1, S: 0, E: 0, C: 0 },
        response_type: 'scale',
        scale: { min: 1, max: 5 }
      },
      {
        id: 'realistic_003',
        text: 'Me interesa construir o reparar cosas',
        category: 'realistic',
        riasec_weights: { R: 3, I: 1, A: 0, S: 0, E: 0, C: 0 },
        response_type: 'scale',
        scale: { min: 1, max: 5 }
      },
      {
        id: 'realistic_004',
        text: 'Disfruto trabajar al aire libre',
        category: 'realistic',
        riasec_weights: { R: 2, I: 0, A: 1, S: 0, E: 0, C: 0 },
        response_type: 'scale',
        scale: { min: 1, max: 5 }
      }
    ],
    investigative: [
      {
        id: 'investigative_001',
        text: 'Me gusta resolver problemas complejos',
        category: 'investigative',
        riasec_weights: { R: 0, I: 3, A: 0, S: 0, E: 1, C: 0 },
        response_type: 'scale',
        scale: { min: 1, max: 5 }
      },
      {
        id: 'investigative_002',
        text: 'Disfruto investigar y analizar información',
        category: 'investigative',
        riasec_weights: { R: 0, I: 3, A: 0, S: 0, E: 0, C: 1 },
        response_type: 'scale',
        scale: { min: 1, max: 5 }
      },
      {
        id: 'investigative_003',
        text: 'Me interesan las ciencias y la investigación',
        category: 'investigative',
        riasec_weights: { R: 1, I: 3, A: 0, S: 0, E: 0, C: 0 },
        response_type: 'scale',
        scale: { min: 1, max: 5 }
      },
      {
        id: 'investigative_004',
        text: 'Me gusta experimentar y probar teorías',
        category: 'investigative',
        riasec_weights: { R: 1, I: 3, A: 0, S: 0, E: 0, C: 0 },
        response_type: 'scale',
        scale: { min: 1, max: 5 }
      }
    ],
    artistic: [
      {
        id: 'artistic_001',
        text: 'Me gusta expresarme de forma creativa',
        category: 'artistic',
        riasec_weights: { R: 0, I: 0, A: 3, S: 1, E: 0, C: 0 },
        response_type: 'scale',
        scale: { min: 1, max: 5 }
      },
      {
        id: 'artistic_002',
        text: 'Disfruto actividades como dibujar, escribir o hacer música',
        category: 'artistic',
        riasec_weights: { R: 0, I: 0, A: 3, S: 0, E: 0, C: 0 },
        response_type: 'scale',
        scale: { min: 1, max: 5 }
      },
      {
        id: 'artistic_003',
        text: 'Me interesa el diseño y la estética',
        category: 'artistic',
        riasec_weights: { R: 0, I: 1, A: 3, S: 0, E: 0, C: 0 },
        response_type: 'scale',
        scale: { min: 1, max: 5 }
      },
      {
        id: 'artistic_004',
        text: 'Prefiero trabajos que me permitan ser original',
        category: 'artistic',
        riasec_weights: { R: 0, I: 0, A: 3, S: 0, E: 1, C: 0 },
        response_type: 'scale',
        scale: { min: 1, max: 5 }
      }
    ],
    social: [
      {
        id: 'social_001',
        text: 'Me gusta ayudar a otras personas',
        category: 'social',
        riasec_weights: { R: 0, I: 0, A: 0, S: 3, E: 1, C: 0 },
        response_type: 'scale',
        scale: { min: 1, max: 5 }
      },
      {
        id: 'social_002',
        text: 'Disfruto trabajar en equipo',
        category: 'social',
        riasec_weights: { R: 0, I: 0, A: 0, S: 3, E: 1, C: 0 },
        response_type: 'scale',
        scale: { min: 1, max: 5 }
      },
      {
        id: 'social_003',
        text: 'Me interesa enseñar o entrenar a otros',
        category: 'social',
        riasec_weights: { R: 0, I: 1, A: 0, S: 3, E: 1, C: 0 },
        response_type: 'scale',
        scale: { min: 1, max: 5 }
      },
      {
        id: 'social_004',
        text: 'Me motiva hacer una diferencia en la vida de las personas',
        category: 'social',
        riasec_weights: { R: 0, I: 0, A: 0, S: 3, E: 0, C: 0 },
        response_type: 'scale',
        scale: { min: 1, max: 5 }
      }
    ],
    enterprising: [
      {
        id: 'enterprising_001',
        text: 'Me gusta liderar proyectos y equipos',
        category: 'enterprising',
        riasec_weights: { R: 0, I: 0, A: 0, S: 1, E: 3, C: 0 },
        response_type: 'scale',
        scale: { min: 1, max: 5 }
      },
      {
        id: 'enterprising_002',
        text: 'Disfruto persuadir y convencer a otros',
        category: 'enterprising',
        riasec_weights: { R: 0, I: 0, A: 0, S: 1, E: 3, C: 0 },
        response_type: 'scale',
        scale: { min: 1, max: 5 }
      },
      {
        id: 'enterprising_003',
        text: 'Me interesa iniciar mi propio negocio',
        category: 'enterprising',
        riasec_weights: { R: 0, I: 1, A: 0, S: 0, E: 3, C: 1 },
        response_type: 'scale',
        scale: { min: 1, max: 5 }
      },
      {
        id: 'enterprising_004',
        text: 'Me gusta tomar decisiones importantes',
        category: 'enterprising',
        riasec_weights: { R: 0, I: 1, A: 0, S: 0, E: 3, C: 1 },
        response_type: 'scale',
        scale: { min: 1, max: 5 }
      }
    ],
    conventional: [
      {
        id: 'conventional_001',
        text: 'Me gusta trabajar con datos y números',
        category: 'conventional',
        riasec_weights: { R: 0, I: 1, A: 0, S: 0, E: 0, C: 3 },
        response_type: 'scale',
        scale: { min: 1, max: 5 }
      },
      {
        id: 'conventional_002',
        text: 'Prefiero seguir procedimientos establecidos',
        category: 'conventional',
        riasec_weights: { R: 1, I: 0, A: 0, S: 0, E: 0, C: 3 },
        response_type: 'scale',
        scale: { min: 1, max: 5 }
      },
      {
        id: 'conventional_003',
        text: 'Me gusta organizar y mantener registros',
        category: 'conventional',
        riasec_weights: { R: 0, I: 0, A: 0, S: 0, E: 1, C: 3 },
        response_type: 'scale',
        scale: { min: 1, max: 5 }
      },
      {
        id: 'conventional_004',
        text: 'Disfruto trabajar con sistemas y procesos ordenados',
        category: 'conventional',
        riasec_weights: { R: 0, I: 1, A: 0, S: 0, E: 0, C: 3 },
        response_type: 'scale',
        scale: { min: 1, max: 5 }
      }
    ]
  };

  static findById(questionId: string): Question | null {
    for (const questions of Object.values(this.questionBank)) {
      const question = questions.find(q => q.id === questionId);
      if (question) return question;
    }
    return null;
  }

  static findByCategory(category: RiasecType, excludeIds: string[] = []): Question[] {
    return this.questionBank[category].filter(q => !excludeIds.includes(q.id));
  }

  static getRandomByCategory(category: RiasecType, excludeIds: string[] = []): Question | null {
    const availableQuestions = this.findByCategory(category, excludeIds);
    if (availableQuestions.length === 0) return null;
    
    const randomIndex = Math.floor(Math.random() * availableQuestions.length);
    return availableQuestions[randomIndex];
  }

  static getAllQuestions(): Question[] {
    return Object.values(this.questionBank).flat();
  }

  static getRandomQuestion(excludeIds: string[] = []): Question | null {
    const allQuestions = this.getAllQuestions().filter(q => !excludeIds.includes(q.id));
    if (allQuestions.length === 0) return null;
    
    const randomIndex = Math.floor(Math.random() * allQuestions.length);
    return allQuestions[randomIndex];
  }
}

