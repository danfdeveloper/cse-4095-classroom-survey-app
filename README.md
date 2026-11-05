# Classroom Survey

Quick in-class understanding checks. Instructors activate a survey and project a QR code; students answer anonymously from their phones.

Stack: React + TypeScript + Vite, Tailwind CSS, React Router, Supabase, Recharts, `qrcode`. Hosted on Cloudflare Pages.

## Setup

### 1. Supabase (database and login)

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, open a **New query** and run each file in `supabase/migrations/` **in filename order**, one at a time:
   1. `20261104000000_initial_schema.sql`: tables, indexes, Row Level Security, the student submit function
   2. `20261105000000_survey_actions.sql`: activate, close, duplicate
   3. `20261105010000_save_survey.sql`: the editor's save
   4. `20261105020000_public_survey.sql`: the student survey lookup
   5. `20261105030000_survey_results.sql`: results aggregation
   6. `20261105040000_preserve_history.sql`: triggers that protect past responses
3. **Authentication → Sign In / Providers:** turn **off** "Allow new users to sign up". Every signed-in user is treated as an instructor.
4. **Authentication → Users → Add user:** create the instructor account, with "Auto confirm" ticked.

### 2. Run locally

```sh
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev                  # http://localhost:5173
```

| Variable                                   | Where to find it                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`                        | Supabase **Connect** button, or Project Settings → Data API (no `/rest/v1/`) |
| `VITE_SUPABASE_ANON_KEY`                   | Project Settings → API Keys → **Publishable** key (never the secret key)     |
| `VITE_PUBLIC_SITE_URL`                     | Base URL used in QR codes: `http://localhost:5173` locally                   |
| `INSTRUCTOR_EMAIL` / `INSTRUCTOR_PASSWORD` | Only for the test scripts. Never prefix them with `VITE_`                    |

`.env.local` is gitignored. Only `VITE_*` variables are included in the browser bundle, and the publishable key is safe there because Row Level Security protects the data.

## Deployment (Cloudflare Pages)

1. Push the repository to GitHub.
2. In the Cloudflare dashboard, go to **Workers & Pages → Create → Pages → Import an existing Git repository**, then pick this repository.
3. Build settings:
   - Framework preset: **React (Vite)** (or None)
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Node version comes from `.nvmrc` (22).
4. Under **Environment variables (Production)**, add:
   - `VITE_SUPABASE_URL`: same as local
   - `VITE_SUPABASE_ANON_KEY`: same as local
   - `VITE_PUBLIC_SITE_URL`: the production URL, for example `https://<project>.pages.dev`. QR codes use it, so it must be the public address.
5. **Save and Deploy.** Every push to the production branch redeploys automatically. Vite inlines the variables at **build time**, so after changing one, use **Retry deployment**.
6. In Supabase, go to **Authentication → URL Configuration** and set **Site URL** to the production URL.

**SPA routing:** there is no `404.html` in the build, so Cloudflare Pages serves `index.html` for every path. Deep links such as `/s/x7kf2q` and `/dashboard` work on a fresh load. `public/_headers` adds security headers and long-term caching for the hashed assets.

**Check the deployed site** with the end-to-end tests: `BASE_URL=https://<project>.pages.dev npm run test:e2e -- --project=chrome`. They need `INSTRUCTOR_*` in `.env.local`, and no survey may be Active.

## Scripts

| Command                | Purpose                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm run dev`          | Start the dev server                                                                                          |
| `npm run build`        | Type-check and build to dist/                                                                                 |
| `npm run lint`         | Run ESLint                                                                                                    |
| `npm run format`       | Format with Prettier                                                                                          |
| `npm run format:check` | Check formatting                                                                                              |
| `npm run verify:db`    | Check the live database: schema, RLS, RPCs (needs `INSTRUCTOR_EMAIL` / `INSTRUCTOR_PASSWORD` in `.env.local`) |
| `npm run test:csv`     | Unit tests for CSV export escaping                                                                            |
| `npm run test:e2e`     | End-to-end tests in Chrome, Firefox and a phone emulator (see `docs/TESTING.md`)                              |

## Layout

```text
src/components/   shared UI components
src/pages/        route-level pages
src/lib/          Supabase client and helpers
supabase/         SQL migrations
```

See `TODO.md` for the roadmap and `docs/TESTING.md` for the test plan, including manual device tests. `DATABASE.md` is the source of truth for the schema.
