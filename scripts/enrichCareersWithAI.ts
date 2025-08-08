import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

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
  updated_at: string;
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
}

async function analyzeCareerWithAI(career: Career): Promise<RiasecAnalysis> {
  const prompt = `Analiza la siguiente carrera universitaria y proporciona un análisis RIASEC completo en español:

CARRERA: ${career.name}
DESCRIPCIÓN: ${career.description}
DURACIÓN: ${career.duration_years} años

Por favor, responde con un JSON PLANO (no anidado) con estos campos exactos:

{
  "realistic_score": number (0-100, trabajo con herramientas/objetos físicos),
  "investigative_score": number (0-100, investigación/análisis/problemas),
  "artistic_score": number (0-100, creatividad/expresión artística),
  "social_score": number (0-100, ayudar/enseñar/trabajar con personas),
  "enterprising_score": number (0-100, liderazgo/ventas/negocios),
  "conventional_score": number (0-100, organización/datos/procedimientos),
  "primary_riasec_type": "realistic" | "investigative" | "artistic" | "social" | "enterprising" | "conventional" (el tipo con mayor puntuación),
  "secondary_riasec_type": "realistic" | "investigative" | "artistic" | "social" | "enterprising" | "conventional" (el segundo más alto),
  "riasec_code": "XYZ" (código de 3 letras con tipos dominantes, ej: "ASE", "IRC"),
  "work_environment": ["ambiente1", "ambiente2"] (2-4 ambientes de: "oficina", "laboratorio", "campo", "hospital", "escuela", "fabrica", "taller", "hogar", "exterior", "remoto", "comercio", "estudio"),
  "key_skills": ["habilidad1", "habilidad2"] (3-5 habilidades de: "comunicacion", "liderazgo", "analisis", "creatividad", "organizacion", "tecnico", "interpersonal", "resolucion-problemas", "investigacion", "matematicas", "escritura", "diseno", "ventas", "ensenanza", "cuidado", "planificacion", "innovacion", "detalle", "trabajo-equipo", "adaptabilidad")
}

Responde SOLO con JSON válido y plano, sin explicaciones ni markdown.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-001',
      contents: `Sistema: Eres un experto en orientación vocacional y análisis RIASEC. Respondes solo con JSON válido y preciso.\n\nUsuario: ${prompt}`
    });

    const content = response.text;
    console.log(`🤖 Raw AI response for ${career.name}:`, content?.substring(0, 300) + '...');
    
    if (!content) {
      throw new Error("No response from Gemini");
    }

    // Clean the response to extract JSON (Gemini sometimes adds markdown)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const jsonContent = jsonMatch ? jsonMatch[0] : content;
    
    console.log(`🔧 Cleaned JSON for ${career.name}:`, jsonContent.substring(0, 300) + '...');
    
    // Parse and validate the JSON response
    const analysis = JSON.parse(jsonContent) as RiasecAnalysis;

    // Validate required fields
    if (!analysis.primary_riasec_type || !analysis.riasec_code) {
      throw new Error("Invalid AI response: missing required fields");
    }

    // Ensure scores are within valid range
    const scores = [
      analysis.realistic_score,
      analysis.investigative_score,
      analysis.artistic_score,
      analysis.social_score,
      analysis.enterprising_score,
      analysis.conventional_score,
    ];

    scores.forEach((score) => {
      if (score < 0 || score > 100) {
        throw new Error(`Invalid score: ${score}. Must be between 0-100`);
      }
    });

    return analysis;
  } catch (error) {
    console.error(`❌ Failed to analyze career ${career.name}:`, error);
    // Re-throw the error instead of providing fallback data
    throw new Error(
      `Failed to analyze career "${career.name}": ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

async function enrichCareers() {
  try {
    console.log("🚀 Starting career enrichment process...");

    // 1. FETCH existing careers from database
    console.log("📥 Fetching existing careers...");
    const { data: careers, error: fetchError } = await supabase
      .from("careers")
      .select("*")
      .order("name");

    if (fetchError) {
      throw new Error(`Error fetching careers: ${fetchError.message}`);
    }

    if (!careers || careers.length === 0) {
      console.log("❌ No careers found in database");
      return;
    }

    console.log(`📊 Found ${careers.length} careers to enrich`);

    // 2. ENRICH each career with AI analysis
    const enrichedCareers: Career[] = [];

    for (let i = 0; i < careers.length; i++) {
      const career = careers[i];
      console.log(
        `🤖 Analyzing career ${i + 1}/${careers.length}: ${career.name}`
      );

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
          updated_at: new Date().toISOString(),
        };

        enrichedCareers.push(enrichedCareer);

        console.log(
          `✅ Enriched: ${career.name} -> ${analysis.riasec_code} (${analysis.primary_riasec_type})`
        );

        // Add delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`❌ Failed to enrich ${career.name}:`, error);
      }
    }

    // 3. UPDATE careers in database
    console.log(`💾 Updating ${enrichedCareers.length} careers in database...`);

    for (const career of enrichedCareers) {
      const { error: updateError } = await supabase
        .from("careers")
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
          updated_at: career.updated_at,
        })
        .eq("id", career.id);

      if (updateError) {
        console.error(
          `❌ Failed to update ${career.name}:`,
          updateError.message
        );
      } else {
        console.log(`✅ Updated: ${career.name}`);
      }
    }

    console.log("🎉 Career enrichment completed successfully!");

    // 4. SUMMARY
    const { data: updatedCareers, error: summaryError } = await supabase
      .from("careers")
      .select("name, primary_riasec_type, riasec_code")
      .not("primary_riasec_type", "is", null)
      .order("primary_riasec_type");

    if (!summaryError && updatedCareers) {
      console.log("\n📈 ENRICHMENT SUMMARY:");
      console.log(`Total enriched careers: ${updatedCareers.length}`);

      const typeCount = updatedCareers.reduce((acc, career) => {
        acc[career.primary_riasec_type] =
          (acc[career.primary_riasec_type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      Object.entries(typeCount).forEach(([type, count]) => {
        console.log(`${type}: ${count} careers`);
      });
    }
  } catch (error) {
    console.error("💥 Error in enrichment process:", error);
    process.exit(1);
  }
}

// Run the enrichment
if (require.main === module) {
  enrichCareers()
    .then(() => {
      console.log("✨ Process completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Process failed:", error);
      process.exit(1);
    });
}

export { enrichCareers };
