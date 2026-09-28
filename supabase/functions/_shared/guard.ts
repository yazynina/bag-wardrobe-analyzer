// ===========================================================================
// Maison - shared guard rails for the Edge Functions.
//
// Everything in this file runs on Supabase's servers. None of it, and in
// particular not the Anthropic API key, is ever sent to a browser.
// ===========================================================================

import {
  createClient,
  SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.45.4";

import {
  ANTHROPIC_URL,
  ANTHROPIC_VERSION,
  DAILY_ANALYSIS_LIMIT,
  MAX_IMAGE_BYTES,
  MAX_PROMPT_CHARS,
  MAX_REQUEST_BYTES,
  SUPPORTED_MEDIA_TYPES,
} from "./config.ts";

export type Cors = Record<string, string>;

/** An error we are happy to show the user, with a tidy HTTP status. */
export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// 1. Who is allowed to call us (the origin allow-list)
// ---------------------------------------------------------------------------

/**
 * ALLOWED_ORIGINS is a comma separated list of web addresses, set as an Edge
 * Function secret. A browser on any other address gets no answer at all.
 *
 * If it is empty we refuse everybody on purpose. The old version of this app
 * answered requests from anywhere on the internet, which is exactly the
 * problem this rewrite exists to fix, so "not configured" must fail closed.
 *
 * Vercel gives every preview deploy its own address, for example
 *
 *   https://bag-wardrobe-analyzer-git-secure-multi-user-yazynina.vercel.app
 *   https://bag-wardrobe-analyzer-k3f9d2a1x-yazynina.vercel.app
 *
 * so ONE entry in the list may contain a single "*" to cover them all:
 *
 *   https://bag-wardrobe-analyzer-*-yazynina.vercel.app
 *
 * A complete, working value therefore looks like this (all on one line):
 *
 *   https://bag-wardrobe-analyzer.vercel.app,
 *   https://bag-wardrobe-analyzer-*-yazynina.vercel.app,
 *   http://localhost:3000
 *
 * The rules below are what keep the wildcard safe:
 *   - wildcards only work on https addresses, never http;
 *   - the "*" may only stand for part of the host name - never the scheme,
 *     never a port, never a path;
 *   - there must be real text on BOTH sides of the "*", so a bare "*",
 *     "https://*" and "https://*.vercel.app" are all refused;
 *   - whatever the "*" matches may not contain a dot, so the pattern can
 *     never stretch sideways into a domain that is not yours;
 *   - only the first wildcard entry is honoured. Extra ones are ignored.
 */

/** What the "*" is allowed to stand for: the characters of one host label. */
const WILDCARD_LABEL = /^[a-z0-9-]+$/i;

const HTTPS = "https://";

/** Is this list entry a wildcard pattern we are willing to honour? */
function isSafeWildcard(pattern: string): boolean {
  if (!pattern.startsWith(HTTPS)) return false;

  const host = pattern.slice(HTTPS.length);

  // Host name only, and exactly one star.
  if (host.includes("/")) return false;
  if (host.split("*").length !== 2) return false;

  const star = host.indexOf("*");
  const prefix = host.slice(0, star);
  const suffix = host.slice(star + 1);

  // Real text on both sides. This is what rules out a bare "*",
  // "https://*" and "https://*.vercel.app".
  if (prefix.length < 3) return false;
  if (suffix.length < 4) return false;
  if (!suffix.includes(".")) return false;

  return true;
}

/** Does a real Origin header match that pattern? */
function wildcardMatches(pattern: string, origin: string): boolean {
  if (!origin.startsWith(HTTPS)) return false;

  const host = pattern.slice(HTTPS.length);
  const star = host.indexOf("*");
  const prefix = host.slice(0, star);
  const suffix = host.slice(star + 1);

  const originHost = origin.slice(HTTPS.length);
  if (originHost.includes("/")) return false;
  if (originHost.length <= prefix.length + suffix.length) return false;
  if (!originHost.startsWith(prefix)) return false;
  if (!originHost.endsWith(suffix)) return false;

  const middle = originHost.slice(
    prefix.length,
    originHost.length - suffix.length,
  );

  return WILDCARD_LABEL.test(middle);
}

/** The single yes/no decision about an incoming Origin header. */
export function isOriginAllowed(origin: string): boolean {
  if (!origin) return false;

  const configured = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (configured.length === 0) return false;

  // Plain entries have to match letter for letter.
  if (configured.some((value) => !value.includes("*") && value === origin)) {
    return true;
  }

  const wildcards = configured
    .filter((value) => value.includes("*"))
    .filter(isSafeWildcard);

  if (wildcards.length === 0) return false;
  if (wildcards.length > 1) {
    console.warn(
      "ALLOWED_ORIGINS has more than one wildcard; only the first is used.",
    );
  }

  return wildcardMatches(wildcards[0], origin);
}

export function corsHeadersFor(req: Request): Cors | null {
  const origin = req.headers.get("origin") || "";

  if (!isOriginAllowed(origin)) return null;

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function jsonResponse(
  body: unknown,
  status: number,
  cors: Cors | null,
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cors) Object.assign(headers, cors);
  return new Response(JSON.stringify(body), { status, headers });
}

// ---------------------------------------------------------------------------
// 2. Is the caller signed in?
// ---------------------------------------------------------------------------

/**
 * Reads the Supabase login token out of the Authorization header and asks
 * Supabase who it belongs to. A missing, expired or forged token gives back
 * user: null, and the caller then gets a 401.
 *
 * The client we hand back is scoped to that person, so anything it does in
 * the database is still filtered by Row Level Security.
 */
export async function requireUser(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";

  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return { user: null, client: null as SupabaseClient | null };
  }

  const client = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_ANON_KEY") || "",
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  const { data, error } = await client.auth.getUser();
  if (error || !data || !data.user) {
    return { user: null, client: null as SupabaseClient | null };
  }

  return { user: data.user, client };
}

// ---------------------------------------------------------------------------
// 3. The daily allowance
// ---------------------------------------------------------------------------

/**
 * Asks the database to spend one of today's credits. The database works out
 * who you are from your own token, so nobody can spend somebody else's
 * allowance, and nobody can skip this by calling the API directly.
 */
export async function consumeCredit(client: SupabaseClient) {
  const { data, error } = await client.rpc("consume_analysis_credit", {
    p_limit: DAILY_ANALYSIS_LIMIT,
  });

  if (error) {
    console.error("consume_analysis_credit failed: " + error.message);
    throw new ApiError(
      "We could not check your daily usage. Please try again.",
      500,
      "usage_check_failed",
    );
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    allowed: Boolean(row && row.allowed),
    used: Number((row && row.used) || 0),
    dailyLimit: Number((row && row.daily_limit) || DAILY_ANALYSIS_LIMIT),
  };
}

/** If Claude never ran, give the credit back. Best effort only. */
export async function refundCredit(client: SupabaseClient) {
  try {
    await client.rpc("refund_analysis_credit");
  } catch (_error) {
    // Not worth failing the request over.
  }
}

// ---------------------------------------------------------------------------
// 4. Reading the request safely
// ---------------------------------------------------------------------------

export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    throw new ApiError("That upload is too big.", 413, "request_too_large");
  }

  const raw = await req.text();
  if (raw.length > MAX_REQUEST_BYTES) {
    throw new ApiError("That upload is too big.", 413, "request_too_large");
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (_error) {
    throw new ApiError("That request was not valid JSON.", 400, "bad_request");
  }
}

/**
 * Turns a browser data URL into the block shape Claude expects.
 *
 * The old code assumed every photo was a JPEG. Here we read the real type
 * out of the data URL instead, so PNG and WEBP uploads are labelled
 * correctly, and anything that is not a supported image is dropped.
 */
export function toImageBlock(value: unknown) {
  if (typeof value !== "string") return null;

  const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i
    .exec(value.trim());
  if (!match) return null;

  let mediaType = match[1].toLowerCase();
  if (mediaType === "image/jpg") mediaType = "image/jpeg";
  if (!SUPPORTED_MEDIA_TYPES.includes(mediaType)) return null;

  const data = match[2].replace(/\s+/g, "");

  // base64 text is about 4/3 the size of the real bytes.
  if (data.length * 0.75 > MAX_IMAGE_BYTES) return null;

  return {
    type: "image",
    source: { type: "base64", media_type: mediaType, data },
  };
}

/**
 * Cleans up any text a user typed before it goes anywhere near a prompt.
 *
 * It strips control characters and the punctuation people use to try to
 * "break out" of a prompt, removes the most common override phrases, and
 * hard-caps the length. Combined with the delimiters used in the prompts
 * themselves, this keeps user text as data rather than instructions.
 */
export function sanitiseUserText(
  value: unknown,
  maxChars: number = MAX_PROMPT_CHARS,
): string {
  if (typeof value !== "string") return "";

  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[<>{}\[\]\\\u0060$|]/g, " ")
    .replace(
      /\b(ignore|disregard|forget|override)\b[^.]{0,40}\binstructions?\b/gi,
      " ",
    )
    .replace(/\bsystem\s*prompt\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

// ---------------------------------------------------------------------------
// 5. Talking to Claude
// ---------------------------------------------------------------------------

export async function callClaude(payload: Record<string, unknown>) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY secret is not set on this function.");
    throw new ApiError(
      "This site is not finished being set up yet.",
      500,
      "server_misconfigured",
    );
  }

  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();

  if (!response.ok) {
    // Logged for you, never shown to the visitor.
    console.error("Anthropic " + response.status + ": " + raw.slice(0, 500));

    if (response.status === 429) {
      throw new ApiError(
        "Claude is busy right now. Please try again in a minute.",
        503,
        "upstream_busy",
      );
    }
    throw new ApiError(
      "Claude could not complete that request.",
      502,
      "upstream_error",
    );
  }

  return JSON.parse(raw);
}

export function extractText(message: unknown): string {
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  const block = content.find(
    (item) => item && (item as { type?: string }).type === "text",
  ) as { text?: string } | undefined;
  return (block && block.text) || "";
}

/** Pulls the JSON blob out of Claude's reply, or null if there isn't one. */
export function extractJson(text: string, prefer: "object" | "array" = "object") {
  if (!text) return null;

  const objectMatch = text.match(/\{[\s\S]*\}/);
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  const first = prefer === "array" ? arrayMatch : objectMatch;
  const second = prefer === "array" ? objectMatch : arrayMatch;
  const candidate = (first && first[0]) || (second && second[0]) || "";

  if (!candidate) return null;

  try {
    return JSON.parse(candidate);
  } catch (_error) {
    return null;
  }
}
