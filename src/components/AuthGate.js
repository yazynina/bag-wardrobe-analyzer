// ===========================================================================
// Maison - the sign-in gate.
//
// Nothing inside the app renders until somebody is signed in. Sign-in is
// passwordless: you type your email address, Supabase emails you a link,
// and clicking it signs you in. No passwords are typed, stored or handled
// by this app at all.
// ===========================================================================

import React, { useContext, useEffect, useState } from 'react';
import { Mail, LogOut, Check, AlertCircle } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

const SessionContext = React.createContext(null);

/** Lets any component below the gate read the signed-in user. */
export function useSession() {
  return useContext(SessionContext);
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-amber-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        {children}
      </div>
    </div>
  );
}

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      return undefined;
    }

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data ? data.session : null);
      setChecking(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
      }
    );

    return () => {
      active = false;
      if (listener && listener.subscription) {
        listener.subscription.unsubscribe();
      }
    };
  }, []);

  const sendLink = async (event) => {
    event.preventDefault();
    setErrorMessage('');

    const address = email.trim();
    if (!address) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: {
        emailRedirectTo: window.location.origin,
        shouldCreateUser: true,
      },
    });
    setSending(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSent(true);
  };

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
  };

  // --- The site owner has not finished the setup yet ----------------------
  if (!isSupabaseConfigured) {
    return (
      <Shell>
        <div className="flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-amber-500 mt-1" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              Almost there
            </h1>
            <p className="text-gray-600 text-sm">
              This copy of Maison has not been connected to its database yet.
              If you are the site owner, copy .env.example to .env, fill in
              your Supabase URL and anon key, and restart.
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  if (checking) {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-3 text-gray-500">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-rose-500" />
          Checking your sign-in...
        </div>
      </Shell>
    );
  }

  // --- Signed out: ask for an email address -------------------------------
  if (!session) {
    return (
      <Shell>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Maison</h1>
        <p className="text-gray-600 mb-6">
          Your handbag wardrobe, analysed. Sign in with your email address -
          there is no password to remember.
        </p>

        {sent ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
            <Check className="w-5 h-5 text-green-600 mt-0.5" />
            <div>
              <p className="font-medium text-green-900">Check your inbox</p>
              <p className="text-sm text-green-800">
                We have sent a sign-in link to {email.trim()}. Open it on this
                device to continue.
              </p>
              <button
                type="button"
                onClick={() => setSent(false)}
                className="text-sm text-green-700 underline mt-2"
              >
                Use a different address
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={sendLink} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                Email address
              </span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="mt-1 w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-rose-400"
              />
            </label>

            {errorMessage ? (
              <p className="text-sm text-red-600">{errorMessage}</p>
            ) : null}

            <button
              type="submit"
              disabled={sending}
              className="w-full bg-gradient-to-r from-rose-500 to-amber-500 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Mail className="w-4 h-4" />
              {sending ? 'Sending...' : 'Email me a sign-in link'}
            </button>

            <p className="text-xs text-gray-400 text-center">
              We only use your address to sign you in.
            </p>
          </form>
        )}
      </Shell>
    );
  }

  // --- Signed in ----------------------------------------------------------
  return (
    <SessionContext.Provider value={session}>
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between text-sm">
          <span className="text-gray-500 truncate">
            Signed in as {session.user.email}
          </span>
          <button
            type="button"
            onClick={signOut}
            className="inline-flex items-center gap-1.5 text-gray-600 hover:text-gray-900"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </div>
      {children}
    </SessionContext.Provider>
  );
}
