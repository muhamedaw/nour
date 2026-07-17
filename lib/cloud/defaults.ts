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

/**
 * Separate, genuinely public bucket for OTA update bundles only.
 *
 * Supabase's unauthenticated read path (`/storage/v1/object/public/...`)
 * is gated by the bucket's own `public` flag — it ignores per-path RLS
 * policies entirely. `nour-backups` must stay private (it holds real
 * session/backup data), so it can never serve that path, which is exactly
 * what OtaUpdater's manifest check needs (the native updater plugin does a
 * plain unauthenticated fetch — it can't send the anon key as a header).
 * Update bundles are just the same JS already inside the installed APK,
 * so a fully public bucket for them carries no real exposure.
 */
export const SUPABASE_OTA_BUCKET = "nour-app-updates";
