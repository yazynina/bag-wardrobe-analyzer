// ===========================================================================
// Maison - talking to the Edge Functions.
//
// The browser never sees the Anthropic API key. It simply asks our own
// Supabase Edge Functions, attaching the signed-in person's token so the
// server can tell who is asking and check their daily allowance.
//
// Note that photos are never sent through here. We only send bag ids; the
// Edge Function reads the photos out of the private bucket itself.
// ===========================================================================

import { supabase } from './supabaseClient';

/** Thrown when the friendly daily limit has been reached. */
export class DailyLimitError extends Error {
  constructor(message, used, dailyLimit) {
    super(message);
    this.name = 'DailyLimitError';
    this.used = used;
    this.dailyLimit = dailyLimit;
  }
}

async function invoke(functionName, payload) {
  if (!supabase) {
    throw new Error(
      'Maison is not connected to its server yet. If you are the site ' +
        'owner, finish the Supabase setup in the README.'
    );
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData ? sessionData.session : null;

  if (!session) {
    throw new Error('Your sign-in has expired. Please sign in again.');
  }

  const { data, error } = await supabase.functions.invoke(functionName, {
    body: payload,
    headers: { Authorization: 'Bearer ' + session.access_token },
  });

  if (error) {
    // supabase-js hides the real reply on error.context. Dig it out so the
    // person sees a useful sentence instead of "Edge Function error".
    let body = null;
    try {
      body = await error.context.json();
    } catch (parseError) {
      body = null;
    }

    if (body && body.code === 'daily_limit_reached') {
      throw new DailyLimitError(body.error, body.used, body.dailyLimit);
    }

    throw new Error(
      (body && body.error) || error.message || 'Something went wrong.'
    );
  }

  if (data && data.code === 'daily_limit_reached') {
    throw new DailyLimitError(data.error, data.used, data.dailyLimit);
  }

  if (data && data.error) {
    throw new Error(data.error);
  }

  return data;
}

/**
 * Analyse the collection. Pass an array of bag ids, or nothing at all to
 * analyse everything in the account.
 */
export function analyzeCollection(bagIds) {
  return invoke('analyze', {
    mode: 'collection',
    bagIds: Array.isArray(bagIds) ? bagIds : [],
  });
}

/** Ask for a resale estimate for one bag. */
export function estimateBagValue(bagId) {
  return invoke('analyze', { mode: 'valuation', bagId });
}

/** Find shoppable suggestions for a recommendation. */
export function searchProducts(query) {
  return invoke('search-image', { query });
}
