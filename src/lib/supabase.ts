import { createClient } from "@supabase/supabase-js";

// The anon key is designed to be public, so these fallbacks are safe. They keep
// builds working when no .env file is present, such as builds made straight
// from the repository.
const FALLBACK_SUPABASE_URL = "https://wifuhcqpmvixipxejanb.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpZnVoY3FwbXZpeGlweGVqYW5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjY4ODcsImV4cCI6MjA5NTQwMjg4N30.J_tn3C8N5VBXaqrpvhRDy4R_xnDWPiDQs02Tlj5IOV8";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || FALLBACK_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
