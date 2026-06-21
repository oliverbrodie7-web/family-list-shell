import { createClient } from "@supabase/supabase-js";

// Publishable anon key — safe to ship in client code.
const SUPABASE_URL = "https://wifuhcqpmvixipxejanb.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpZnVoY3FwbXZpeGlweGVqYW5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjY4ODcsImV4cCI6MjA5NTQwMjg4N30.J_tn3C8N5VBXaqrpvhRDy4R_xnDWPiDQs02Tlj5IOV8";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
