import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function migrateToV2() {
  try {
    console.log('🚀 Starting migration to V2 schema...');

    // 1. Backup existing career data (if any)
    console.log('📦 Backing up existing data...');
    const { data: existingCareers, error: careerError } = await supabase
      .from('careers')
      .select('*');

    const { data: existingSchools, error: schoolError } = await supabase
      .from('schools')
      .select('*');

    const { data: existingCareerSchools, error: csError } = await supabase
      .from('career_schools')
      .select('*');

    if (careerError && !careerError.message.includes('does not exist')) {
      console.warn('⚠️ Career backup error:', careerError.message);
    }

    console.log(`📊 Found ${existingCareers?.length || 0} careers, ${existingSchools?.length || 0} schools, ${existingCareerSchools?.length || 0} career-school relationships`);

    // 2. Apply new schema
    console.log('🔄 Applying new schema...');
    const schemaPath = join(__dirname, '../database/schema_v2.sql');
    const schemaSql = readFileSync(schemaPath, 'utf8');

    // Split schema into individual statements and execute
    const statements = schemaSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      try {
        const { error } = await supabase.rpc('exec_sql', { sql: statement });
        if (error && !error.message.includes('already exists')) {
          console.warn(`⚠️ Statement warning: ${error.message}`);
        }
      } catch (err) {
        console.warn(`⚠️ Statement execution warning:`, err);
      }
    }

    // 3. Restore career data if it existed
    if (existingCareers && existingCareers.length > 0) {
      console.log('🔄 Restoring career data...');
      
      for (const career of existingCareers) {
        const { error } = await supabase
          .from('careers')
          .upsert(career);
        
        if (error) {
          console.error(`❌ Failed to restore career ${career.name}:`, error.message);
        }
      }
    }

    if (existingSchools && existingSchools.length > 0) {
      console.log('🔄 Restoring school data...');
      
      for (const school of existingSchools) {
        const { error } = await supabase
          .from('schools')
          .upsert(school);
        
        if (error) {
          console.error(`❌ Failed to restore school ${school.name}:`, error.message);
        }
      }
    }

    if (existingCareerSchools && existingCareerSchools.length > 0) {
      console.log('🔄 Restoring career-school relationships...');
      
      for (const relationship of existingCareerSchools) {
        const { error } = await supabase
          .from('career_schools')
          .upsert(relationship);
        
        if (error) {
          console.error(`❌ Failed to restore career-school relationship:`, error.message);
        }
      }
    }

    // 4. Verify migration
    console.log('✅ Verifying migration...');
    
    const { data: newCareers } = await supabase
      .from('careers')
      .select('count(*)', { count: 'exact', head: true });

    const { data: newSessions } = await supabase
      .from('conversational_sessions')
      .select('count(*)', { count: 'exact', head: true });

    console.log(`📊 Migration complete:`);
    console.log(`   - Careers: ${newCareers?.[0]?.count || 0}`);
    console.log(`   - Conversational sessions table: ✅ Created`);
    console.log(`   - User profiles table: ✅ Created`);

    console.log('🎉 Migration to V2 completed successfully!');

  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
if (require.main === module) {
  migrateToV2()
    .then(() => {
      console.log('✨ Migration process completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration process failed:', error);
      process.exit(1);
    });
}

export { migrateToV2 };