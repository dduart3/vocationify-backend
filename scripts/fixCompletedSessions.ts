import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fixCompletedSessions() {
  try {
    console.log("🔍 Finding sessions that should be marked as completed...");

    // Find sessions with current_phase = 'complete' but status = 'in_progress'
    const { data: sessionsToFix, error: fetchError } = await supabase
      .from("test_sessions")
      .select("*")
      .eq("current_phase", "complete")
      .eq("status", "in_progress");

    if (fetchError) {
      throw new Error(`Error fetching sessions: ${fetchError.message}`);
    }

    if (!sessionsToFix || sessionsToFix.length === 0) {
      console.log("✅ No sessions found to fix - all are properly marked!");
      return;
    }

    console.log(`📊 Found ${sessionsToFix.length} sessions to fix:`);
    
    for (const session of sessionsToFix) {
      console.log(`- Session ${session.id}: ${session.user_id} (created: ${session.created_at})`);
    }

    console.log("🔧 Updating session statuses...");

    // Update all found sessions to completed status
    const { error: updateError } = await supabase
      .from("test_sessions")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("current_phase", "complete")
      .eq("status", "in_progress");

    if (updateError) {
      throw new Error(`Error updating sessions: ${updateError.message}`);
    }

    console.log("✅ Successfully updated all completed sessions!");
    
    // Verify the fix
    const { data: verifyData, error: verifyError } = await supabase
      .from("test_sessions")
      .select("id, status, current_phase, completed_at")
      .eq("current_phase", "complete");

    if (verifyError) {
      console.log("⚠️  Could not verify results");
    } else {
      console.log("\n📈 VERIFICATION RESULTS:");
      console.log(`Total sessions with current_phase='complete': ${verifyData?.length || 0}`);
      
      const completed = verifyData?.filter(s => s.status === 'completed').length || 0;
      const inProgress = verifyData?.filter(s => s.status === 'in_progress').length || 0;
      
      console.log(`✅ Status 'completed': ${completed}`);
      console.log(`⏳ Status 'in_progress': ${inProgress}`);
      
      if (inProgress > 0) {
        console.log("⚠️  Some sessions are still marked as in_progress despite being complete!");
      } else {
        console.log("🎉 All complete sessions are now properly marked!");
      }
    }

  } catch (error) {
    console.error("💥 Error fixing completed sessions:", error);
    process.exit(1);
  }
}

// Run the fix
if (require.main === module) {
  fixCompletedSessions()
    .then(() => {
      console.log("✨ Process completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Process failed:", error);
      process.exit(1);
    });
}

export { fixCompletedSessions };