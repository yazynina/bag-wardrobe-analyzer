// ===========================================================================
// Maison - the settings you are most likely to want to change.
//
// Both Edge Functions (analyze and search-image) read their settings from
// this one file, so a number only ever has to be changed in one place.
// ===========================================================================

/**
 * DAILY_ANALYSIS_LIMIT
 * How many Claude requests ONE signed-in person may make per day (UTC).
 * Collection analyses, bag valuations and product searches all count
 * towards this same number. Change the number here and redeploy - nothing
 * else needs touching.
 */
export const DAILY_ANALYSIS_LIMIT = 15;

/**
 * CLAUDE_MODEL
 * Which Claude model to send requests to.
 * If Anthropic ever retires this model you will see "model not found"
 * errors - come back here, paste in the current model name from
 * https://docs.anthropic.com/en/docs/about-claude/models and redeploy.
 */
export const CLAUDE_MODEL = "claude-sonnet-4-5";

// ---------------------------------------------------------------------------
// Safety caps. These exist so that a single request can never run up a
// surprise bill, and so nobody can use the app to upload huge files.
// ---------------------------------------------------------------------------

/** Most photos Claude will look at in one go. */
export const MAX_IMAGES_PER_REQUEST = 12;

/** Biggest single photo, in bytes (5 MB). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Biggest whole request, in bytes (25 MB). */
export const MAX_REQUEST_BYTES = 25 * 1024 * 1024;

/** Longest piece of free text a user is allowed to put into a prompt. */
export const MAX_PROMPT_CHARS = 400;

/** Most words Claude may write back. */
export const MAX_OUTPUT_TOKENS = 2000;

// ---------------------------------------------------------------------------
// Anthropic API details. You should not need to change these.
// ---------------------------------------------------------------------------
export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

/** Image formats Claude accepts. Anything else is rejected before sending. */
export const SUPPORTED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];
