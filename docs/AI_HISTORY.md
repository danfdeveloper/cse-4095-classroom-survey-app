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

## Phase 3 — Instructor authentication

**Prompt:** "Continue to next phase."

**Agent output:**

- The auth state is split into three files: `src/auth/context.ts`, `AuthProvider.tsx` and `useAuth.ts`. `AuthProvider` restores the session with `getSession` and stays in sync through `onAuthStateChange`.
- `src/components/ProtectedRoute.tsx` sends signed-out users to `/login` and remembers the page they were trying to reach.
- `src/pages/LoginPage.tsx` has labelled email and password fields and a "Logging in..." state that disables the button. It shows friendly error messages instead of raw Supabase errors.
- `src/components/AppHeader.tsx` shows "Signed in as <email>" and a Logout button.
- `src/pages/DashboardPage.tsx` is a placeholder. The real dashboard is Phase 4.
- `src/lib/styles.ts` holds the shared button and input styles. They have 44px touch targets and visible focus outlines.

**Testing:** The agent drove headless Chrome with Playwright against the live Supabase project and checked 11 things:

- The redirect when signed out.
- The message for a wrong password.
- A successful login.
- The email shown in the header.
- The session surviving a page refresh.
- The redirect from `/login` when already signed in.
- Logout.
- `/dashboard` being protected again after logout.
- The 404 page.
- No uncaught errors.

Playwright was installed outside the project, so it is not a project dependency.

**Problem:** On the first run, the "shows signed-in instructor" check failed. The agent checked what the header actually contained, and the email was there. The test had checked visibility once, without waiting, and ran before React finished rendering the header. After changing it to wait for the element, everything passed on two consecutive runs.

**Decisions:**

- **Friendly login errors:** "Incorrect email or password." and "Could not reach the server..." replace the raw error text (API.md §13).
- **Redirect after login:** you return to the page you originally asked for, or `/dashboard` by default.
- **Logout destination:** logout returns you to `/login`.

---

## Phase 4 — Instructor dashboard

**Prompt:** "Continue to next phase."

**Agent output:**

- **Migration `20261105000000_survey_actions.sql`** with three RPCs:
  - `activate_survey` closes any other Active survey, generates a slug and sets the survey to Active.
  - `close_survey` sets an Active survey to Closed.
  - `duplicate_survey` copies the survey into a new Draft called "Copy of ...", with its questions and choices but no responses.
  - All three are `security invoker`, so RLS applies and `anon` cannot call them.
- **`src/lib/surveys.ts`:** the survey types and data functions, plus mapping of database error codes to friendly messages.
- **Dashboard:** survey cards with a text status badge, the creation date and the response count. Each status gets its own set of actions. There is a title search, a status filter, loading, error and empty states, and a New Survey button.
- **`ConfirmDialog`:** built on the native `<dialog>` element, so focus trapping and Escape to cancel come from the browser. It is used for close, archive, delete, and activating a survey when another one is already Active.
- **Placeholder pages** for `/surveys/new`, `/surveys/:id/edit`, `/present` and `/results`.

I applied the migration in the Supabase SQL Editor.

**Testing:**

- `npm run verify:db` was extended to 42 checks. The new checks cover all three RPCs, the activation rules, anon being unable to call them, and archiving.
- A Playwright browser test at phone width (390px) runs 22 checks using the real buttons:
  - activate, then activate a second survey (confirm dialog, the first one closes);
  - Escape cancels a dialog; close, archive and delete;
  - the stronger delete warning when responses exist, and the cascade to responses;
  - duplicate (redirects to the copy's editor);
  - search, the status filter and the no-match state;
  - no horizontal scroll, visible keyboard focus and no console errors.
- The empty "You have not created any surveys yet." state was checked separately.
- The test data was deleted afterwards.

**Problem:** The first draft of the migration revoked the slug generator from `authenticated`. Because `activate_survey` runs with the caller's permissions, activation would have failed with "permission denied". The agent caught this while reviewing its own SQL, before it was applied.

**Decisions:**

- **RPCs written early:** activation, close and duplicate were built now, although the plan puts them in Phases 6 and 12, because the dashboard buttons need them. As a result, the matching Phase 6 and Phase 12 TODO items are checked off.
- **Only Draft surveys can be activated.** Closed surveys are not reopened, which follows UI.md's closed-survey card (Results, Duplicate, Archive). Activating an already Active survey does nothing.
- **Activation validation:** the survey needs at least one question, and every question needs at least two choices (`SURVEY_HAS_NO_QUESTIONS`, `QUESTION_NEEDS_CHOICES`). The specs do not cover this.
- **Slug format:** 6 characters from an alphabet without look-alike characters (no 0, o, 1, l or i), drawn from `gen_random_uuid()` randomness. A slug is created on first activation and kept afterwards.
- **Actions per status:**

  | Status   | Actions                                    |
  | -------- | ------------------------------------------ |
  | Draft    | Edit, Activate, Duplicate, Archive, Delete |
  | Active   | Present, Results, Close, Duplicate         |
  | Closed   | Results, Duplicate, Archive, Delete        |
  | Archived | Results, Duplicate, Delete                 |

  Active surveys must be closed before they can be archived or deleted, and there is no "unarchive".

- **Confirmation only when needed:** activation asks for confirmation only when it will close another survey (UI.md: "avoid excessive modal dialogs").
- **Response count on cards:** each card shows its response count, which UI.md's card mockup does not include. The count is also used for the stronger delete warning UI.md asks for.
- **After duplicating**, the instructor is redirected to the copy's editor (the Phase 12 behaviour).

---

## Decisions made ahead of later phases

- **Phase 5, editing:** only **Draft** surveys can be edited. The assignment says "edit existing draft surveys". TODO.md implied that closed surveys could be edited too, but deleting a question from a closed survey would also delete stored student answers. To reuse a closed survey, duplicate it instead.
- **Grader access:** a separate Supabase user is created for the grader. Its credentials go only in the HuskyCT submission, never in the repo.
