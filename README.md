# Maison

Your handbag wardrobe, analysed. A React front end hosted on Vercel, with
Supabase for accounts, data and photo storage, and two Supabase Edge
Functions that talk to the Claude API from the server.

## How the pieces fit together

```
Browser (React, hosted on Vercel)
  |
  |-- signs in with a passwordless email link  -->  Supabase Auth
  |-- reads and writes only its own rows       -->  Supabase Postgres
  |-- uploads and views only its own photos    -->  Supabase Storage
  |-- asks for an AI analysis                  -->  Edge Function
                                                      |
                                                      +-->  Claude API
```

The browser never sees the Anthropic API key. It is stored as a Supabase
Edge Function secret and is only ever used server side.

## Security model, in short

- **No secrets in the browser.** The only values shipped to the front end
  are the Supabase project URL and the public anon key, both of which are
  designed to be public.
- **Row Level Security everywhere.** Every table has RLS switched on with
  owner-only policies, so the database refuses to return another account
  rows even if the front-end code asked it to.
- **A private photo bucket.** `bag-photos` is not public. Files live under
  `<user-id>/...` and the storage policies check that folder name against
  the signed-in user. Photos are displayed through short-lived signed
  links.
- **Signed-in only Edge Functions.** Both functions reject any request
  without a valid Supabase token, and only answer requests from websites
  listed in the `ALLOWED_ORIGINS` secret. If that secret is empty they
  refuse everything, on purpose.
- **A daily allowance.** Each account gets `DAILY_ANALYSIS_LIMIT` AI
  requests per day, counted inside the database so it cannot be skipped
  by calling the API directly.
- **Prompt hygiene.** Anything a person types is cleaned up,
  length-capped and wrapped in markers that tell the model to treat it as
  data rather than instructions.

## The two settings you are most likely to change

Both live at the top of `supabase/functions/_shared/config.ts`:

| Setting | What it does |
| --- | --- |
| `DAILY_ANALYSIS_LIMIT` | AI requests allowed per account per day |
| `CLAUDE_MODEL` | Which Claude model to call |

Change the value, then redeploy the two functions.

## First-time setup

You need a Supabase project and the Supabase CLI. On a Mac:

```bash
brew install supabase/tap/supabase
```

### 1. Apply the database migration

The migration creates the tables, the RLS policies, the daily-limit
function and the private photo bucket.

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

If you would rather not use the CLI, open the Supabase dashboard, go to
the SQL Editor, paste the whole contents of the file in
`supabase/migrations/` and press Run.

### 2. Set the server-side secrets

```bash
supabase secrets set ANTHROPIC_API_KEY=your-anthropic-key
supabase secrets set ALLOWED_ORIGINS=https://your-app.vercel.app,http://localhost:3000
```

`ALLOWED_ORIGINS` is a comma separated list with no spaces. Include every
address the app is served from, including Vercel preview URLs you want to
test on.

### 3. Deploy the Edge Functions

```bash
supabase functions deploy analyze
supabase functions deploy search-image
```

### 4. Configure Supabase Auth

In the dashboard, under Authentication:

- Providers: make sure **Email** is enabled, with "Confirm email" on.
- URL Configuration: set **Site URL** to your production address and add
  your Vercel preview addresses plus `http://localhost:3000` to
  **Redirect URLs**.
- Before inviting real people, set up **custom SMTP**. The built-in
  Supabase email service is rate limited to a handful of messages an hour
  and is only meant for development.

### 5. Point the front end at Supabase

```bash
cp .env.example .env
```

Fill in `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY`. Both
are in the dashboard under Project Settings > API. Use the **anon /
public** key. Never put the service_role key in this file.

Set the same two variables in Vercel under Project Settings >
Environment Variables, for Production, Preview and Development.

### 6. Run it locally

```bash
npm install
npm start
```

## Moving an old collection into an account

Earlier versions of this app kept bags in the browser own localStorage.
The first time you sign in, if the app finds bags there it offers to
import them into your account. Photos go to the private bucket, details
go to the `bags` table, and the old browser copy is cleared afterwards
(including any Anthropic key that version had saved).

## What lives where

| Path | What it is |
| --- | --- |
| `src/App.js` | The main screen |
| `src/components/AuthGate.js` | Passwordless sign-in wrapper |
| `src/lib/supabaseClient.js` | The browser Supabase client |
| `src/lib/maisonApi.js` | Calls the Edge Functions |
| `src/lib/bagStore.js` | Reads and writes bags, plus the import |
| `supabase/functions/analyze/` | Collection analysis and valuations |
| `supabase/functions/search-image/` | Product suggestions |
| `supabase/functions/_shared/` | Settings and shared guard rails |
| `supabase/migrations/` | Tables, RLS policies, storage bucket |

## Things deliberately removed

`api/analyze.js`, `api/search-image.js` and `netlify/functions/analyze.js`
have been deleted. They accepted an Anthropic API key in the request body,
allowed requests from any website, and had no sign-in check or rate limit.
Everything they did now happens in the Edge Functions instead.
