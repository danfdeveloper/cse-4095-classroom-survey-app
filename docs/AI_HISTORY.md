# AI Development History

A summary of how the AI coding agent (Claude Code, the model Claude Opus 5.5) was guided through building this project. Each phase lists what was asked, what the agent did, any problems found, and the design decisions made where the specs were silent or disagreed.

---

## Specification review

**Prompt:** I shared the five spec documents and asked the agent to describe the project back to me, to confirm we understood it the same way.

**Agent output:** It gave a summary of the architecture: a React SPA, Supabase for auth, Postgres, RLS and RPC functions, Cloudflare Pages for hosting, and a single instructor with anonymous students. It also flagged these issues:

- TODO.md used `/s/:surveyId` while UI.md and API.md used `/s/:slug`.
- The security policies give full access to _any_ authenticated user, so public sign-ups must be disabled.
- The overall spec's schema is older than DATABASE.md and is missing `public_slug` and `updated_at`.
- A single global Active survey would block supporting multiple instructors later.

**My direction:** Reset TODO.md so nothing is checked, and treat **DATABASE.md as the source of truth**.

Later I shared the assignment guidelines and asked the agent to compare them with the plan. It found deliverables the plan didn't cover: the spec docs in the repo, a grader login, this history file, the summary report and screenshots. It also found one conflict, about which surveys can be edited (see Phase 5 below).

---

## Phase 1 — Project setup

**Prompt:** "Work on phase 1."

**Agent output:**

- Scaffolded the app with Vite, React and TypeScript.
- Added Tailwind CSS v4, React Router, `@supabase/supabase-js`, Recharts and `qrcode`.
- Set up ESLint and Prettier.
- Created the folders `src/components`, `src/pages`, `src/lib` and `supabase/migrations`.
- Added `.env.example`, the home page, a 404 page and a README.
- Verified that lint and the build pass and that the dev server serves the page.

**Problems:**

- The current Vite template ships `oxlint` instead of ESLint, so the agent replaced it to match TODO.md.
- `typescript-eslint` does not support TypeScript 7 yet. The `npm install` failed with a peer-dependency error, so the agent pinned TypeScript to 6.0.

**Decisions:**

- Added a `VITE_PUBLIC_SITE_URL` env variable so QR codes can point at the production domain instead of whichever host the page was opened on.
- Turned on strict TypeScript mode, added a Prettier plugin that sorts Tailwind classes, and added a 404 page.
- Put the app at the repo root rather than in a `classroom-survey/` subfolder.

Later, at my request, the agent extended `.gitignore` to cover Supabase CLI state, Wrangler (Cloudflare) local files, and all `.env*` files except `.env.example`.

---

## Supabase configuration

**Problem I hit:**

- I put my real Supabase values in `.env.example`, a file that gets committed, instead of `.env.local`.
- I copied the URL with `/rest/v1/` on the end.

The agent spotted both, moved the values into the gitignored `.env.local`, removed the URL suffix, and restored placeholders in `.env.example`. It then confirmed the connection with a health-check request, which returned HTTP 200. Nothing had been committed, so the key never entered git history.

**Configuration in Supabase:**

- Public sign-ups are disabled.
- The instructor account was created manually under Authentication → Users.

---

## Phase 2 — Database

**Prompt:** "Start next phase, and check the boxes in todo when completed."

**Agent output:**

- `supabase/migrations/20261104000000_initial_schema.sql`, which follows DATABASE.md. It contains:
  - the five tables, foreign keys with cascades, and the indexes;
  - the status check, the `updated_at` trigger, the one-active-survey partial unique index, and the duplicate-token unique index;
  - the RLS policies;
  - the `submit_survey_response` RPC.
- `scripts/verify-db.ts` (run with `npm run verify:db`). It creates a temporary survey, runs about 30 checks as an anonymous student and as the instructor, then deletes the survey.

I applied the migration by pasting it into the Supabase SQL Editor.

**Problem:** On the first run, the verify script reported a failure on the "close survey" step. The database was fine. The bug was in the script: the update didn't request the updated row back, so the helper saw no data and treated it as an error. After adding `.select()`, all checks passed.

**Decisions:**

- **Submission RPC written early.** `submit_survey_response` was moved up from Phases 7–8, because verifying that "anonymous students can submit" needs it.
- **No direct anonymous inserts.** Students have no INSERT policy, and every submission goes through the `security definer` RPC, which validates everything in one transaction. DATABASE.md §9 recommends this.
- **Explicit grants.** `anon` can only SELECT `surveys`, `questions` and `choices`. This is defense in depth on top of RLS.
- **Extra error code `INVALID_PAYLOAD`** for malformed input. API.md's list doesn't include it.
- **Every question is required.** The specs don't define optional questions.
- **Submissions lock the survey row** (`FOR SHARE`), so a survey cannot be closed in the middle of a submission.
- **`activate_survey` and `close_survey` are deferred to Phase 6.** For now the verify script changes the status directly.
- **Known issue for Phase 7:** anonymous users cannot see closed surveys, so the student page can't tell "closed" apart from "not found". This will need a small status-lookup RPC.

---

## Decisions made ahead of later phases

- **Phase 5, editing:** only **Draft** surveys can be edited. The assignment says "edit existing draft surveys". TODO.md implied that closed surveys could be edited too, but deleting a question from a closed survey would also delete stored student answers. To reuse a closed survey, duplicate it instead.
- **Grader access:** a separate Supabase user is created for the grader. Its credentials go only in the HuskyCT submission, never in the repo.
