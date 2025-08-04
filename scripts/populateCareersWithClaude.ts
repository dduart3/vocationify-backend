import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

interface CareerRiasecData {
  primary_riasec_type: string;
  secondary_riasec_type: string;
  riasec_code: string;
  realistic_score: number;
  investigative_score: number;
  artistic_score: number;
  social_score: number;
  enterprising_score: number;
  conventional_score: number;
  work_environment: any;
  key_skills: string[];
  related_careers: string[];
}

async function generateCareerRiasecData(careerName: string, careerDescription: string): Promise<CareerRiasecData | null> {
  try {
    const prompt = `
Analiza la siguiente carrera profesional y proporciona datos RIASEC detallados para un sistema de orientación vocacional en Venezuela:

CARRERA: ${careerName}
DESCRIPCIÓN: ${careerDescription}

Por favor proporciona la información en el siguiente formato JSON exacto (sin texto adicional):

{
  "primary_riasec_type": "realistic|investigative|artistic|social|enterprising|conventional",
  "secondary_riasec_type": "realistic|investigative|artistic|social|enterprising|conventional", 
  "riasec_code": "código de 3 letras (ej: RIC, SAE, etc)",
  "realistic_score": número_del_0_al_100,
  "investigative_score": número_del_0_al_100,
  "artistic_score": número_del_0_al_100,
  "social_score": número_del_0_al_100,
  "enterprising_score": número_del_0_al_100,
  "conventional_score": número_del_0_al_100,
  "work_environment": {
    "setting": ["lista de lugares de trabajo típicos"],
    "team_size": "pequeño|medio|grande",
    "travel_required": true|false,
    "physical_demands": "bajo|moderado|alto"
  },
  "key_skills": ["habilidad1", "habilidad2", "habilidad3", "habilidad4", "habilidad5"],
  "related_careers": ["carrera1", "carrera2", "carrera3"]
}

CRITERIOS RIASEC:
- Realistic (R): Trabajo manual, herramientas, actividades físicas, construcción
- Investigative (I): Investigación, análisis, ciencias, resolución de problemas
- Artistic (A): Creatividad, expresión, diseño, arte, originalidad
- Social (S): Ayuda a otros, enseñanza, trabajo en equipo, servicios
- Enterprising (E): Liderazgo, ventas, persuasión, toma de decisiones
- Conventional (C): Organización, datos, procedimientos, administración

Los puntajes deben sumar aproximadamente 300-400 puntos en total. El tipo primario debe tener el puntaje más alto (70-95), el secundario debe ser significativo (50-80), y los demás deben reflejar la realidad de la profesión.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ANTHROPIC_API_KEY}`,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      console.error(`Anthropic API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    const content = data.content[0]?.text;
    
    if (!content) {
      console.error('No content received from Anthropic API');
      return null;
    }

    // Parse JSON response
    try {
      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}') + 1;
      const jsonStr = content.substring(jsonStart, jsonEnd);
      
      const parsedData = JSON.parse(jsonStr);
      
      // Validate required fields
      const requiredFields = [
        'primary_riasec_type', 'secondary_riasec_type', 'riasec_code',
        'realistic_score', 'investigative_score', 'artistic_score',
        'social_score', 'enterprising_score', 'conventional_score',
        'work_environment', 'key_skills', 'related_careers'
      ];
      
      for (const field of requiredFields) {
        if (!(field in parsedData)) {
          console.error(`Missing required field: ${field}`);
          return null;
        }
      }
      
      return parsedData;
      
    } catch (parseError) {
      console.error('Error parsing JSON response:', parseError);
      console.log('Raw content:', content);
      return null;
    }

  } catch (error) {
    console.error('Error generating career RIASEC data:', error);
    return null;
  }
}

async function populateCareersWithClaude() {
  console.log('🚀 Starting career RIASEC population with Claude...');

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not found in environment variables');
    console.log('Please add ANTHROPIC_API_KEY=your_api_key_here to your .env file');
    return;
  }

  try {
    // Get all existing careers that need RIASEC data
    const { data: careers, error } = await supabase
      .from('careers')
      .select('id, name, description')
      .is('primary_riasec_type', null); // Only get careers without RIASEC data

    if (error) {
      console.error('❌ Error fetching careers:', error);
      return;
    }

    if (!careers || careers.length === 0) {
      console.log('ℹ️ No careers found that need RIASEC data');
      return;
    }

    console.log(`📊 Found ${careers.length} careers to analyze`);

    for (let i = 0; i < careers.length; i++) {
      const career = careers[i];
      console.log(`\n🔄 Processing ${i + 1}/${careers.length}: ${career.name}...`);
      
      const riasecData = await generateCareerRiasecData(
        career.name, 
        career.description || 'No description available'
      );
      
      if (riasecData) {
        const { error: updateError } = await supabase
          .from('careers')
          .update({
            ...riasecData,
            updated_at: new Date().toISOString()
          })
          .eq('id', career.id);

        if (updateError) {
          console.error(`❌ Error updating ${career.name}:`, updateError);
        } else {
          console.log(`✅ Updated ${career.name} - ${riasecData.riasec_code} (${riasecData.primary_riasec_type}/${riasecData.secondary_riasec_type})`);
        }
      } else {
        console.log(`⚠️ Failed to generate RIASEC data for ${career.name}`);
      }

      // Add a small delay to respect API rate limits
      if (i < careers.length - 1) {
        console.log('⏳ Waiting 2 seconds...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log('\n🎉 Career RIASEC population completed!');

    // Show summary
    const { data: updatedCareers } = await supabase
      .from('careers')
      .select('name, primary_riasec_type, riasec_code')
      .not('primary_riasec_type', 'is', null);

    console.log('\n📈 Updated careers summary:');
    updatedCareers?.forEach(career => {
      console.log(`  • ${career.name}: ${career.riasec_code} (${career.primary_riasec_type})`);
    });

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the script
if (require.main === module) {
  populateCareersWithClaude();
}

export { populateCareersWithClaude, generateCareerRiasecData };