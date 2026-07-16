/**
 * Hardcoded Telegram bot token for the single-tenant deployment.
 *
 * This app always uses the same bot, so per-install configuration UI has
 * been removed. The token ships in the JS bundle (static-exported APK),
 * which is an accepted risk for this offline-first single-tenant setup —
 * losing the token means creating a new bot via @BotFather.
 */

export const TELEGRAM_BOT_TOKEN =
  "8699292510:AAG_B5-s5X4tPP7Mc_w7UuXvZNJqsSa3nJo";
