import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

interface Career {
  id: string;
  name: string;
  description: string;
  duration_years: number;
  // New fields we want to populate
  primary_riasec_type?: string;
  secondary_riasec_type?: string;
  riasec_code?: string;
  realistic_score?: number;
  investigative_score?: number;
  artistic_score?: number;
  social_score?: number;
  enterprising_score?: number;
  conventional_score?: number;
  work_environment?: string[];
  key_skills?: string[];
  related_careers?: string[];
  updated_at:string;
}

interface RiasecAnalysis {
  primary_riasec_type: string;
  secondary_riasec_type: string;
  riasec_code: string;
  realistic_score: number;
  investigative_score: number;
  artistic_score: number;
  social_score: number;
  enterprising_score: number;
  conventional_score: number;
  work_environment: string[];
  key_skills: string[];
  related_careers: string[];
}

async function analyzeCareerWithAI(career: Career): Promise<RiasecAnalysis> {
  const prompt = `
Analiza la siguiente carrera universitaria y proporciona un análisis RIASEC completo en español:

CARRERA: ${career.name}
DESCRIPCIÓN: ${career.description}
DURACIÓN: ${career.duration_years} años

Por favor, proporciona un análisis detallado en formato JSON con:

1. RIASEC SCORES (0-100 para cada tipo):
   - realistic_score: Trabajo con herramientas, máquinas, objetos físicos
   - investigative_score: Investigación, análisis, resolución de problemas
   - artistic_score: Creatividad, expresión artística, originalidad
   - social_score: Ayudar, enseñar, trabajar con personas
   - enterprising_score: Liderazgo, ventas, persuasión, negocios
   - conventional_score: Organización, datos, procedimientos estructurados

2. TIPOS DOMINANTES:
   - primary_riasec_type: El tipo con mayor puntuación
   - secondary_riasec_type: El segundo tipo más alto
   - riasec_code: Código de 3 letras (ej: "IAS", "SEC")

3. CONTEXTO LABORAL:
   - work_environment: Array de 5-8 ambientes de trabajo típicos
   - key_skills: Array de 8-12 habilidades clave necesarias
   - related_careers: Array de 6-10 carreras relacionadas

Responde SOLO con JSON válido, sin explicaciones adicionales.
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "Eres un experto en orientación vocacional y análisis RIASEC. Respondes solo con JSON válido y preciso."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 1000
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    // Parse and validate the JSON response
    const analysis = JSON.parse(content) as RiasecAnalysis;
    
    // Validate required fields
    if (!analysis.primary_riasec_type || !analysis.riasec_code) {
      throw new Error('Invalid AI response: missing required fields');
    }

    // Ensure scores are within valid range
    const scores = [
      analysis.realistic_score,
      analysis.investigative_score,
      analysis.artistic_score,
      analysis.social_score,
      analysis.enterprising_score,
      analysis.conventional_score
    ];

    scores.forEach(score => {
      if (score < 0 || score > 100) {
        throw new Error(`Invalid score: ${score}. Must be between 0-100`);
      }
    });

    return analysis;

  } catch (error) {
    console.error(`Error analyzing career ${career.name}:`, error);
    
    // Fallback analysis if AI fails
    return {
      primary_riasec_type: 'investigative',
      secondary_riasec_type: 'conventional',
      riasec_code: 'IC',
      realistic_score: 30,
      investigative_score: 70,
      artistic_score: 20,
      social_score: 40,
      enterprising_score: 30,
      conventional_score: 50,
      work_environment: ['oficina', 'universidad', 'laboratorio'],
      key_skills: ['análisis', 'investigación', 'comunicación'],
      related_careers: ['Carreras relacionadas por determinar']
    };
  }
}

async function enrichCareers() {
  try {
    console.log('🚀 Starting career enrichment process...');

    // 1. FETCH existing careers from database
    console.log('📥 Fetching existing careers...');
    const { data: careers, error: fetchError } = await supabase
      .from('careers')
      .select('*')
      .order('name');

    if (fetchError) {
      throw new Error(`Error fetching careers: ${fetchError.message}`);
    }

    if (!careers || careers.length === 0) {
      console.log('❌ No careers found in database');
      return;
    }

    console.log(`📊 Found ${careers.length} careers to enrich`);

    // 2. ENRICH each career with AI analysis
    const enrichedCareers: Career[] = [];
    
    for (let i = 0; i < careers.length; i++) {
      const career = careers[i];
      console.log(`🤖 Analyzing career ${i + 1}/${careers.length}: ${career.name}`);

      try {
        // Skip if already enriched (has RIASEC data)
        if (career.primary_riasec_type && career.riasec_code) {
          console.log(`⏭️  Skipping ${career.name} - already enriched`);
          continue;
        }

        const analysis = await analyzeCareerWithAI(career);
        
        const enrichedCareer: Career = {
          ...career,
          ...analysis,
          updated_at: new Date().toISOString()
        };

        enrichedCareers.push(enrichedCareer);
        
        console.log(`✅ Enriched: ${career.name} -> ${analysis.riasec_code} (${analysis.primary_riasec_type})`);
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`❌ Failed to enrich ${career.name}:`, error);
      }
    }

    // 3. UPDATE careers in database
    console.log(`💾 Updating ${enrichedCareers.length} careers in database...`);

    for (const career of enrichedCareers) {
      const { error: updateError } = await supabase
        .from('careers')
        .update({
          primary_riasec_type: career.primary_riasec_type,
          secondary_riasec_type: career.secondary_riasec_type,
          riasec_code: career.riasec_code,
          realistic_score: career.realistic_score,
          investigative_score: career.investigative_score,
          artistic_score: career.artistic_score,
          social_score: career.social_score,
          enterprising_score: career.enterprising_score,
          conventional_score: career.conventional_score,
          work_environment: career.work_environment,
          key_skills: career.key_skills,
          related_careers: career.related_careers,
          updated_at: career.updated_at
        })
        .eq('id', career.id);

      if (updateError) {
        console.error(`❌ Failed to update ${career.name}:`, updateError.message);
      } else {
        console.log(`✅ Updated: ${career.name}`);
      }
    }

    console.log('🎉 Career enrichment completed successfully!');
    
    // 4. SUMMARY
    const { data: updatedCareers, error: summaryError } = await supabase
      .from('careers')
      .select('name, primary_riasec_type, riasec_code')
      .not('primary_riasec_type', 'is', null)
      .order('primary_riasec_type');

    if (!summaryError && updatedCareers) {
      console.log('\n📈 ENRICHMENT SUMMARY:');
      console.log(`Total enriched careers: ${updatedCareers.length}`);
      
      const typeCount = updatedCareers.reduce((acc, career) => {
        acc[career.primary_riasec_type] = (acc[career.primary_riasec_type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      Object.entries(typeCount).forEach(([type, count]) => {
        console.log(`${type}: ${count} careers`);
      });
    }

  } catch (error) {
    console.error('💥 Error in enrichment process:', error);
    process.exit(1);
  }
}

// Run the enrichment
if (require.main === module) {
  enrichCareers()
    .then(() => {
      console.log('✨ Process completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Process failed:', error);
      process.exit(1);
    });
}

export { enrichCareers };
