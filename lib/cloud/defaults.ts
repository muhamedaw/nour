/**
 * Hardcoded Supabase project credentials for the single-tenant deployment.
 *
 * This app always talks to one project/bucket, so per-install configuration
 * UI has been removed. The anon key ships in the JS bundle (static-exported
 * APK), which is an accepted risk for this offline-first single-tenant
 * setup — the key only grants write access to the private backups bucket.
 */

export const SUPABASE_URL = "https://myoyicfqbfqtyryhbvdi.supabase.co";
export const SUPABASE_ANON_KEY =
  "sb_publishable_4B-RhLsj86-vs0NgvduQlA_7yyUYrAI";
export const SUPABASE_BUCKET = "nour-backups";
